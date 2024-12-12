"use strict";

var mongoose = require("mongoose");
var ObjectId = mongoose.Schema.Types.ObjectId;

var LastReadMessageSchema = new mongoose.Schema({
    user: {
        type: ObjectId,
        ref: "User",
        required: true,
    },
    room: {
        type: ObjectId,
        ref: "Room",
        required: true,
    },
    message: {
        type: ObjectId,
        ref: "Message",
        required: true,
    },
});

module.exports = mongoose.model("LastReadMessage", LastReadMessageSchema);
