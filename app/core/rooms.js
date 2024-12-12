"use strict";

var mongoose = require("mongoose"),
    ObjectId = require("mongoose"),
    _ = require("lodash"),
    helpers = require("./helpers");

var getParticipants = async function (room, options, cb) {
    if (!room.private || !options.participants) {
        return cb(null, []);
    }

    var participants = [];

    if (Array.isArray(options.participants)) {
        participants = options.participants;
    }

    if (typeof options.participants === "string") {
        participants = options.participants
            .replace(/@/g, "")
            .split(",")
            .map(function (username) {
                return username.trim();
            });
    }

    participants = _.chain(participants)
        .map(function (username) {
            return username && username.replace(/@,\s/g, "").trim();
        })
        .filter(function (username) {
            return !!username;
        })
        .uniq()
        .value();

    var User = mongoose.model("User");
    var users = await User.find({ username: { $in: participants } });
    cb(null, users);
};

function RoomManager(options) {
    this.core = options.core;
}

RoomManager.prototype.canJoin = function (options, cb) {
    var method = options.id ? "get" : "slug",
        roomId = options.id ? options.id : options.slug;

    this[method](roomId, function (err, room) {
        if (err) {
            return cb(err);
        }

        if (!room) {
            return cb();
        }

        room.canJoin(options, function (err, canJoin) {
            cb(err, room, canJoin);
        });
    });
};

RoomManager.prototype.create = async function (options, cb) {
    var Room = mongoose.model("Room");
    var room = await Room.create(options);
    if (!room) {
        return cb("Không tìm thấy room");
    }

    if (cb) {
        room = room;
        cb(null, room);
        this.core.emit("rooms:new", room);
    }
    return room;
};

RoomManager.prototype.update = async function (roomId, options, cb) {
    var Room = mongoose.model("Room");
    var room = await Room.findById(roomId);
    if (!room) {
        console.error("Không tìm thấy room");
        if (cb) cb("Room does not exist.", null);
        return null;
    }

    if (room.private && !room.owner.equals(options.user.id)) {
        return cb("Only owner can change private room.");
    }

    getParticipants(
        room,
        options,
        async function (err, participants) {
            if (err) {
                // Oh noes, a bad thing happened!
                console.error(err);
                if (cb) cb(err);
                return null;
            }
            // console.log(room, options);
            room.name = options.name;
            // DO NOT UPDATE SLUG
            // room.slug = options.slug;
            room.description = options.description;

            if (room.private) {
                room.password = options.password;
                room.participants = participants;
            }

            var roomUpdate = await room.save();
            if (!roomUpdate) {
                console.error("Cập nhật room thất bại");
                if (cb) cb("Cập nhật room thất bại");
                return null;
            }
            room = roomUpdate;
            // console.log(cb);
            if (cb) cb(null, room);
            this.core.emit("rooms:update", room);
        }.bind(this)
    );
    return room;
    // Room.findById(roomId, function(err, room) {

    // }.bind(this));
};

RoomManager.prototype.archive = function (roomId, cb) {
    var Room = mongoose.model("Room");

    const archiveRoom = async (roomId) => {
        try {
            const room = await Room.findById(roomId);

            if (!room) {
                return cb("Room does not exist.");
            }

            room.archived = true;
            const updatedRoom = await room.save();
            if (cb) {
                cb(null, updatedRoom);
            }
            this.core.emit("rooms:archive", updatedRoom);
        } catch (err) {
            console.error(err);
            return cb(err);
        }
    };

    // Gọi hàm archiveRoom
    archiveRoom(roomId);
};

RoomManager.prototype.list = async function (options, cb) {
    options = options || {};

    options = helpers.sanitizeQuery(options, {
        defaults: {
            take: 500,
        },
        maxTake: 5000,
    });

    var Room = mongoose.model("Room");

    var find = Room.find({
        archived: { $ne: true },
        $or: [
            { private: { $exists: false } },
            { private: false },

            { owner: options.userId },

            { participants: options.userId },

            { password: { $exists: true, $ne: "" } },
        ],
    });

    if (options.skip) {
        find.skip(options.skip);
    }

    if (options.take) {
        find.limit(options.take);
    }

    if (options.sort) {
        var sort = options.sort.replace(",", " ");
        find.sort(sort);
    } else {
        find.sort("-lastActive");
    }

    find.populate("participants");

    var rooms = await find.exec();

    if (!rooms) {
        return cb(err);
    }

    _.each(
        rooms,
        function (room) {
            this.sanitizeRoom(options, room);
        }.bind(this)
    );

    if (options.users && !options.sort) {
        rooms = _.sortBy(rooms, ["userCount", "lastActive"]).reverse();
    }

    cb(null, rooms);
};

RoomManager.prototype.sanitizeRoom = function (options, room) {
    var authorized = options.userId && room.isAuthorized(options.userId);

    if (options.users) {
        if (authorized) {
            room.users = this.core.presence.getUsersForRoom(room.id.toString());
        } else {
            room.users = [];
        }
    }
};

RoomManager.prototype.findOne = async function (options, cb) {
    var Room = mongoose.model("Room");
    var room = await Room.findOne(options.criteria)
        .populate("participants")
        .exec();
    if (!room) {
        return cb("Không tìm thấy room");
    }

    this.sanitizeRoom(options, room);
    cb(null, room);
};

RoomManager.prototype.get = async function (options, cb) {
    var identifier;

    if (typeof options === "string") {
        identifier = options;
        options = {};
        options.identifier = identifier;
    } else {
        identifier = options.identifier;
    }

    options.criteria = {
        _id: identifier,
        archived: { $ne: true },
    };

    await this.findOne(options, cb);
};

RoomManager.prototype.slug = async function (options, cb) {
    var identifier;

    if (typeof options === "string") {
        identifier = options;
        options = {};
        options.identifier = identifier;
    } else {
        identifier = options.identifier;
    }

    options.criteria = {
        slug: identifier,
        archived: { $ne: true },
    };

    await this.findOne(options, cb);
};

RoomManager.prototype.setLastMessage = async function (options, cb) {
    var Room = mongoose.model("Room");
    const roomId = options.room;
    const messageId = options.message;
    var room = await Room.findByIdAndUpdate(
        { _id: roomId },
        { lastMessage: messageId }
    );
    if (cb) {
        if (room) {
            cb(null, room);
        } else {
            cb("Không tìm thấy room");
        }
    }
};

RoomManager.prototype.calcAlert = async function (options, cb) {
    const userId = options.userId;
    const roomId = options.roomId;

    var Messages = mongoose.model("Message");
    var LastReadMessage = mongoose.model("LastReadMessage");
    const createAt = await LastReadMessage.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                room: new mongoose.Types.ObjectId(roomId),
            },
        },
        {
            $lookup: {
                from: "messages",
                localField: "message",
                foreignField: "_id",
                as: "messageInfo",
            },
        },
        {
            $unwind: "$messageInfo",
        },
        {
            $project: {
                _id: 0,
                posted: "$messageInfo.posted",
            },
        },
    ]);
    if (createAt.length > 0) {
        const alertCount = await Messages.countDocuments({
            posted: { $gt: createAt[0].posted },
            room: roomId,
        });
        if (cb) {
            cb(null, alertCount);
        }
    } else {
        if (cb) {
            const messageCount = await Messages.countDocuments({
                room: roomId,
            });
            cb(null, messageCount);
        }
    }
};

module.exports = RoomManager;
