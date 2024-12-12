"use strict";

var mongoose = require("mongoose");

function AccountManager(options) {
    this.core = options.core;
}

AccountManager.prototype.create = async function (provider, options, cb) {
    var User = mongoose.model("User");
    var user = new User({ provider: provider });

    Object.keys(options).forEach(function (key) {
        user.set(key, options[key]);
    });

    try {
        // Sử dụng await để lưu user mà không cần callback
        await user.save();
        // Nếu cần, bạn có thể gọi callback ở đây sau khi thành công
        if (cb) cb(null, user);
    } catch (error) {
        // Xử lý lỗi nếu có
        if (cb) cb(error);
    }
};

AccountManager.prototype.update = async function (id, options, cb) {
    var User = mongoose.model("User");
    var usernameChange = false;

    var user = await User.findById(id);
    if (!user) {
        return cb("Không lấy được user");
    }

    if (options.firstName) {
        user.firstName = options.firstName;
    }
    if (options.lastName) {
        user.lastName = options.lastName;
    }
    if (options.displayName) {
        user.displayName = options.displayName;
    }
    if (options.email) {
        user.email = options.email;
    }

    if (options.openRooms) {
        user.openRooms = options.openRooms;
    }

    if (options.username && options.username !== user.username) {
        var xmppConns = this.core.presence.system.connections.query({
            userId: user._id,
            type: "xmpp",
        });

        if (xmppConns.length) {
            return cb(
                null,
                null,
                "You can not change your username " +
                    "with active XMPP sessions."
            );
        }

        usernameChange = true;
        user.username = options.username;
    }

    if (user.local) {
        if (options.password || options.newPassword) {
            user.password = options.password || options.newPassword;
        }
    }

    var user = await user.save();
    if (!user) {
        return cb("Update user thất bại");
    }

    this.core.emit("account:update", {
        usernameChanged: usernameChange,
        user: user.toJSON(),
    });

    if (cb) {
        cb(null, user);
    }

    // User.findById(id, async function (err, user) {

    // }.bind(this));
};

AccountManager.prototype.findByUserName = async function (username, cb) {
    var User = mongoose.model("User");
    var user = await User.findOne({ username: username });
    if (user) {
        return cb(user);
    }
    return cb(null);
};

AccountManager.prototype.generateToken = async function (id, cb) {
    var User = mongoose.model("User");

    var user = await User.findById(id);
    if (!user) {
        return cb("Khong tìm thấy user");
    }

    user.generateToken(async function (err, token) {
        if (err) {
            return cb(err);
        }

        await user.save(function (err) {
            if (err) {
                return cb(err);
            }

            cb(null, token);
        });
    });
};

AccountManager.prototype.revokeToken = function (id, cb) {
    var User = mongoose.model("User");

    User.update({ _id: id }, { $unset: { token: 1 } }, cb);
};

module.exports = AccountManager;
