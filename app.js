//
// Let's Chat
//

"use strict";

process.title = "letschat";

require("colors");

var _ = require("lodash"),
    path = require("path"),
    fs = require("fs"),
    express = require("express.oi"),
    i18n = require("i18n"),
    bodyParser = require("body-parser"),
    cookieParser = require("cookie-parser"),
    compression = require("compression"),
    helmet = require("helmet"),
    http = require("http"),
    nunjucks = require("nunjucks"),
    mongoose = require("mongoose"),
    connectMongo = require("connect-mongo"),
    all = require("require-tree"),
    psjon = require("./package.json"),
    settings = require("./app/config"),
    auth = require("./app/auth/index"),
    core = require("./app/core/index");

var httpEnabled = settings.http && settings.http.enable,
    httpsEnabled = settings.https && settings.https.enable,
    models = all(path.resolve("./app/models")),
    middlewares = all(path.resolve("./app/middlewares")),
    controllers = all(path.resolve("./app/controllers")),
    app;

//
// express.oi Setup
//
if (httpsEnabled) {
    app = express()
        .https({
            key: fs.readFileSync(settings.https.key),
            cert: fs.readFileSync(settings.https.cert),
            passphrase: settings.https.passphrase,
        })
        .io();
} else {
    app = express().http().io();
}

if (settings.env === "production") {
    app.set("env", settings.env);
    app.set("json spaces", undefined);
    app.enable("view cache");
}

// Session
// var sessionStore = MongoStore.create({
//     mongoUrl: settings.database.uri,  // Thay thế bằng URI MongoDB của bạn
//   })

console.log("settings.database.uri", settings.database.uri);
const sessionStore = connectMongo.create({
    mongoUrl: settings.database.uri, // Đảm bảo rằng bạn thay thế bằng URI MongoDB của mình
});

// new MongoStore({
//     url: settings.database.uri,
//     autoReconnect: true
// });

// Session
var session = {
    key: "connect.sid",
    secret: settings.secrets.cookie,
    store: sessionStore,
    cookie: { secure: httpsEnabled },
    resave: false,
    saveUninitialized: true,
};

// Set compression before any routes
app.use(compression({ threshold: 512 }));

app.use(cookieParser());
app.io.session(session);

auth.setup(app, session, core);

// Security protections
app.use(helmet.frameguard());
app.use(helmet.hidePoweredBy());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(
    helmet.hsts({
        maxAge: 31536000,
        includeSubdomains: true,
        force: httpsEnabled,
        preload: true,
    })
);
app.use(
    helmet.contentSecurityPolicy({
        defaultSrc: ["'none'"],
        connectSrc: ["*"],
        scriptSrc: ["'self'", "'unsafe-eval'"],
        styleSrc: ["'self'", "fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        mediaSrc: ["'self'"],
        objectSrc: ["'self'"],
        imgSrc: ["* data:"],
    })
);

var bundles = {};
app.use(
    require("connect-assets")({
        paths: ["media/js", "media/less"],
        helperContext: bundles,
        build: settings.env === "production",
        fingerprinting: settings.env === "production",
        servePath: "media/dist",
    })
);

// Public
app.use(
    "/media",
    express.static(__dirname + "/media", {
        maxAge: "364d",
    })
);

// Templates
var nun = nunjucks.configure("templates", {
    autoescape: true,
    express: app,
    tags: {
        blockStart: "<%",
        blockEnd: "%>",
        variableStart: "<$",
        variableEnd: "$>",
        commentStart: "<#",
        commentEnd: "#>",
    },
});

function wrapBundler(func) {
    // This method ensures all assets paths start with "./"
    // Making them relative, and not absolute
    return function () {
        return func
            .apply(func, arguments)
            .replace(/href="\//g, 'href="./')
            .replace(/src="\//g, 'src="./');
    };
}

nun.addFilter("js", wrapBundler(bundles.js));
nun.addFilter("css", wrapBundler(bundles.css));
nun.addGlobal("text_search", false);

// i18n
i18n.configure({
    directory: path.resolve(__dirname, "./locales"),
    locales: settings.i18n.locales || settings.i18n.locale,
    defaultLocale: settings.i18n.locale,
});
app.use(i18n.init);

// HTTP Middlewares
app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

// IE header
app.use(function (req, res, next) {
    res.setHeader("X-UA-Compatible", "IE=Edge,chrome=1");
    next();
});

//
// Controllers
//
_.each(controllers, function (controller) {
    controller.apply({
        app: app,
        core: core,
        settings: settings,
        middlewares: middlewares,
        models: models,
        controllers: controllers,
    });
});

//
// Mongo
//

mongoose.connection.on("error", function (err) {
    throw new Error(err);
});

mongoose.connection.on("disconnected", function () {
    throw new Error("Could not connect to database");
});

//
// Go Time
//

function startApp() {
    var port =
        (httpsEnabled && settings.https.port) ||
        (httpEnabled && settings.http.port);

    var host =
        (httpsEnabled && settings.https.host) ||
        (httpEnabled && settings.http.host) ||
        "0.0.0.0";

    console.log("startApp running -> 0");

    if (httpsEnabled && httpEnabled) {
        // Create an HTTP -> HTTPS redirect server
        var redirectServer = express();
        redirectServer.get("*", function (req, res) {
            var urlPort = port === 80 ? "" : ":" + port;
            res.redirect("https://" + req.hostname + urlPort + req.path);
        });
        http.createServer(redirectServer).listen(
            settings.http.port || 5000,
            host
        );
    }
    console.log("startApp running -> 1");
    app.listen(port, host);
    console.log("startApp running -> 2");
    //
    // XMPP
    //
    if (settings.xmpp.enable) {
        var xmpp = require("./app/xmpp/index");
        xmpp(core);
    }
    console.log("startApp running -> 3");
    var art = fs.readFileSync("./app/misc/art.txt", "utf8");
    console.log("\n" + art + "\n\n" + "Release " + psjon.version.yellow + "\n");
}

function checkForMongoTextSearch() {
    console.log("checkForMongoTextSearch running -> 0");
    if (!mongoose.mongo || !mongoose.mongo.Admin) {
        // MongoDB API has changed, assume text search is enabled
        nun.addGlobal("text_search", true);
        console.log("checkForMongoTextSearch running -> return");
        return;
    }
    console.log("checkForMongoTextSearch running -> 1");
    var admin = new mongoose.mongo.Admin(mongoose.connection.db);
    admin.buildInfo(function (err, info) {
        if (err || !info) {
            return;
        }

        var version = info.version.split(".");
        if (version.length < 2) {
            return;
        }

        if (version[0] < 2) {
            return;
        }

        if (version[0] === "2" && version[1] < 6) {
            return;
        }

        nun.addGlobal("text_search", true);
    });
    console.log("checkForMongoTextSearch running -> 2");
}

// mongoose.connect(settings.database.uri, function(err) {
//     if (err) {
//         throw err;
//     }

//     checkForMongoTextSearch();
//     startApp();
// });

async function connectDB() {
    try {
        await mongoose.connect(settings.database.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected to MongoDB successfully!");
        checkForMongoTextSearch();
        startApp();
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

connectDB();

// const { MongoClient } = require('mongodb');
// const uri = "mongodb://localhost:27017/letschat";

// async function testConnection() {
//   const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
//   try {
//     await client.connect();
//     console.log("testConnection:Connected to MongoDB successfully!");
//     const db = client.db("your_database");
//     const collections = await db.listCollections().toArray();
//     console.log("testConnection:Collections:", collections);
//   } catch (error) {
//     console.error("testConnection:Connection error:", error);
//   } finally {
//     await client.close();
//   }
// }

// testConnection();
