'use strict';

var fs = require('fs'),
    path = require('path'),
    mongodb = require('mongodb'),
    settings = require('../../config');

const { GridFsStorage } = require("multer-gridfs-storage");
const multer = require("multer");    

function LocalFiles(options) {
    this.options = options;

    this.getUrl = this.getUrl.bind(this);
    this.save = this.save.bind(this);
}

LocalFiles.prototype.getUrl = function(file) {
    return path.resolve(this.options.dir + '/' + file._id);
};

LocalFiles.prototype.save = async function(options, callback) {
    var file = options.file,
        doc = options.doc,
        fileFolder = doc._id,
        filePath = fileFolder + '/' + encodeURIComponent(doc.name),
        newPath = this.options.dir + '/' + fileFolder;
    console.log(settings.database.uri_nodb,settings.database.db_name);
    
    // const storage = new GridFsStorage({
    //     url: settings.database.uri,
    //     file: (req, file) => {
    //     return new Promise((resolve, _reject) => {
    //         const fileInfo = {
    //         filename: file.originalname,
    //         bucketName: "filesBucket",
    //         };
    //         resolve(fileInfo);
    //     });
    //     },
    // });
    
    
    const client = new mongodb.MongoClient(settings.database.uri_nodb);
    try {
        await client.connect();
        console.log("LocalFiles.prototype.save:Connected to MongoDB successfully!");
        const db = client.db(settings.database.db_name);
        var bucket = new mongodb.GridFSBucket(db);
        console.log('bucket',bucket);
        // const collections = await db.listCollections().toArray();
        // console.log("testConnection:Collections:", collections);
        console.log('file.path',file.path);
        console.log('doc.name',doc.name);
        await new Promise((resolve, reject) => {
            fs.createReadStream(file.path)
                .pipe(bucket.openUploadStream(doc.name))
                .on('error', function (error) {
                    console.error("Error uploading file:", error);
                    reject(error);
                })
                .on('finish', function () {
                    console.log('File upload completed successfully!');
                    resolve();
                });
        });

    } catch (error) {
        console.error("LocalFiles.prototype.save: error:", error);
    } finally {
        await client.close();
    }

    this.copyFile(file.path, newPath, function(err) {

        if (err) {
            return callback(err);
        }

        // Let the clients know about the new file
        var url = '/files/' + filePath;
        callback(null, url, doc);
    });
};

LocalFiles.prototype.copyFile = function(path, newPath, callback) {
    fs.readFile(path, function(err, data) {
        if (err) {
            return callback(err);
        }

        fs.writeFile(newPath, data, function(err) {
            callback(err);
        });
    });
};

module.exports = LocalFiles;
