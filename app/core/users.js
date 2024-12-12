"use strict";

var mongoose = require("mongoose"),
    helpers = require("./helpers");

function UserManager(options) {
    this.core = options.core;
}

UserManager.prototype.list = async function (options, cb) {
    options = options || {};

    options = helpers.sanitizeQuery(options, {
        defaults: {
            take: 500,
        },
        maxTake: 5000,
    });

    var User = mongoose.model("User");

    var find = User.find();

    if (options.skip) {
        find.skip(options.skip);
    }

    if (options.take) {
        find.limit(options.take);
    }

    var users = await find.exec();
    if (cb) cb(null, users);
};

UserManager.prototype.get = async function (identifier, cb) {
    var User = mongoose.model("User");
    // User.findById(identifier, cb);
    const user = await User.findById(identifier);
    if (!user) {
        return cb("User does not exist.");
    } else cb(null, user);
};

UserManager.prototype.username = async function (username, cb) {
    var User = mongoose.model("User");
    const user = await User.findOne({
        username: username,
    });
    if (!user) cb("Không tìm thấy user");
    else cb(null, user);
    // User.findOne({
    //     username: username
    // }, cb);
};

UserManager.prototype.addOpenRoom = async function (userId, roomId, cb) {
    var User = mongoose.model("User");
    const user = await User.findOneAndUpdate(
        { _id: userId },
        {
            $push: {
                openRooms: roomId,
            },
        },
        { new: true }
    );
    this.core.emit("rooms:addAdmin", user, roomId);
    if (cb) {
        if (user) {
            cb(user);
        } else {
            cb(null);
        }
    }
};

UserManager.prototype.clearAlerts = async function (userId, roomId, cb) {
    //get last message in room
    var Room = mongoose.model("Room");
    const room = await Room.findById(roomId);
    const lastMessage = room?.lastMessage;
    if (lastMessage) {
        var LastReadMessage = mongoose.model("LastReadMessage");
        const lastReadMessage = await LastReadMessage.updateOne(
            {
                room: roomId,
                user: userId,
            },
            { $set: { message: lastMessage, room: roomId, user: userId } },
            { upsert: true }
        );
        if (lastReadMessage) {
            if (cb) {
                if (user) {
                    cb(user);
                } else {
                    cb(null);
                }
            }
        }
    }
};

module.exports = UserManager;
