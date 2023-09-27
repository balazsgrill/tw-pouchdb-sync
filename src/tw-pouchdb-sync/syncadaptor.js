/*\
title: $:/plugins/balazsgrill/tw-pouchdb-sync/syncadaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising with PouchDB/CouchDB instances

\*/
(function(){

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    var CONFIG_HOST_TIDDLER = "$:/config/pouchdb/host",
        DEFAULT_HOST_TIDDLER = "http://localhost:5984/tiddlers";

    if ($tw.browser){
        window.PouchDB = require("$:/plugins/balazsgrill/tw-pouchdb-sync/pouchdb.min.js")
    }

    function PouchDBAdaptor(options) {
        this.logger = new $tw.utils.Logger("PouchDBAdaptor");
        this.logger.log("Using PouchDB SyncAdaptor implementation")
        this.wiki = options.wiki;
        this.host = this.getHost();
        this.PouchDB = new window.PouchDB(this.getHost())
    }
    
    PouchDBAdaptor.prototype.name = "pouchdbsync";

    PouchDBAdaptor.prototype.getHost = function() {
        var text = this.wiki.getTiddlerText(CONFIG_HOST_TIDDLER,DEFAULT_HOST_TIDDLER);
        return text;
    };
    
    PouchDBAdaptor.prototype.getTiddlerInfo = function(tiddler) {
        return {
            bag: tiddler.fields.bag
        };
    };
    
    /*
    Get an array of skinny tiddler fields from the server
    */
    PouchDBAdaptor.prototype.getSkinnyTiddlers = function(callback) {
        this.logger.log("Attempt synchronization")
        self = this
        this.PouchDB.allDocs({
            include_docs: true
        }).then(function(result){
            callback(null, result.rows.map(function(row){
                return {
                    revision: row.value.rev,
                    ...row.doc
                }
            }))
        }).catch(function(err){
            self.logger.log(err, null)
        })
    };
    
    PouchDBAdaptor.prototype.isTextContent = function(doc) {
        return !doc.type || doc.type.startsWith("text/") || doc.type == "application/javascript" || doc.type == "application/json" || doc.type == "application/x-tiddler-dictionary"
    }
    PouchDBAdaptor.prototype.toPouchRepresentation = function(tiddler) {
        var doc = {...tiddler.fields}
        delete doc.text;
        doc._id = tiddler.fields.title
        if (tiddler.fields.revision != "0"){ 
            doc._rev = tiddler.fields.revision
        }
        var attachment = tiddler.fields.text
        if (this.isTextContent(doc)) {
            let utf8Encode = new TextEncoder()
            let bytes = utf8Encode.encode(tiddler.fields.text)
            attachment = btoa(bytes)
        }
        return [doc, attachment]
    }
    PouchDBAdaptor.prototype.fromPouchRepresentation = function(doc,attachment) {  
        var tiddler = doc
        if (this.isTextContent(doc)) {
            let bytes = atob(attachment)
            let utf8Decode = new TextDecoder()
            tiddler.text = utf8Decode.decode(bytes)
        } else {
            tiddler.text = attachment
        }
        return tiddler
    }

    PouchDBAdaptor.prototype.putDoc = function(doc,attachment,callback) {
        var self = this;
        this.PouchDB.put(doc).then(function (response) {
            if (attachment) {
                self.PouchDB.putAttachment(doc._id, "text", response.rev, attachment, doc.type).then(function (atresponse) {
                    callback(null,{},atresponse.rev)
                }).catch(function(err){
                    callback(err, null, null)
                }) 
            }else{
                callback(null,{},response.rev)
            }
        }).catch(function(err) {
            callback(err,null,null)
        })
    }

    /*
    Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
    */
    PouchDBAdaptor.prototype.saveTiddler = function(tiddler,callback) {
        this.logger.log("Saving ", tiddler.fields.title)
        var self = this;
        const [doc, attachment] = this.toPouchRepresentation(tiddler)
        if (!doc._rev) {
            // Check for existing element
            this.PouchDB.get(doc._id).then(function (response) {
                doc._rev = response._rev;
                self.putDoc(doc,attachment,callback)
            }).catch(function(err) {
                self.putDoc(doc,attachment,callback)
            })
        } else {
            this.putDoc(doc,attachment,callback)
        }
        
    };
    
    /*
    Load a tiddler and invoke the callback with (err,tiddlerFields)
    */
    PouchDBAdaptor.prototype.loadTiddler = function(title,callback) {
        this.logger.log("Loading ", title)
        var self = this;
        this.PouchDB.get(title).then(function(doc){
            callback(null,self.fromPouchRepresentation(doc))
        }).catch(function(err){
            callback(err,null)
        })
    };
    
    /*
    Delete a tiddler and invoke the callback with (err)
    options include:
    tiddlerInfo: the syncer's tiddlerInfo for this tiddler
    */
    PouchDBAdaptor.prototype.deleteTiddler = function(title,callback,options) {
       // we need to get from DB first to determine rev. No need to delete if it does not exist in DB
        var self = this;
        this.PouchDB.get(title).then(function(doc){
            self.PouchDB.remove(title, doc._rev).then(function(response){
                callback(null)
            }).catch(function(err){
                callback(err)
            })
        }).catch(function(err){
            callback(null)
        })
    };
    
    if($tw.browser) {
        exports.adaptorClass = PouchDBAdaptor;
    }
    
    })();