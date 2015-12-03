"use strict";

/**
 * Extends io by adding the methods `get`, `read`, `update`, `insert`, `send` and `delete` to it.
 *
 * @example
 * var IO = require("io/extra/io-transfer.js")(window);
 *
 * <i>Copyright (c) 2014 ITSA - https://github.com/itsa</i>
 * New BSD License - http://choosealicense.com/licenses/bsd-3-clause/
 *
 * @module io
 * @submodule io-transfer
 * @class IO
 * @since 0.0.1
*/

require('js-ext/lib/string.js');
require('js-ext/lib/object.js');
require('polyfill/polyfill-base.js');

/*jshint proto:true */
var NAME = '[io-transfer]: ',
    createHashMap = require('js-ext/extra/hashmap.js').createMap,
    PROTO_SUPPORTED = !!Object.__proto__,
    REVIVER = function(key, value) {
        return ((typeof value==='string') && value.toDate()) || value;
    },
    REVIVER_PROTOTYPED = function(key, value, proto, parseProtoCheck, reviveDate) {
        if (reviveDate && (typeof value==='string')) {
            return value.toDate() || value;
        }
        if (!Object.isObject(value)) {
            return value;
        }
        // only first level of objects can be given the specified prototype
        if ((typeof parseProtoCheck === 'function') && !parseProtoCheck(value)) {
            return value;
        }
        if (PROTO_SUPPORTED) {
            value.__proto__ = proto;
            return value;
        }
        return value.deepClone(null, proto);
    },
    MIME_JSON = 'application/json',
    CONTENT_TYPE = 'Content-Type',
    DELETE = 'delete',
    REGEXP_ARRAY = /^( )*\[/,
    REGEXP_OBJECT = /^( )*{/,
    REGEXP_REMOVE_LAST_COMMA = /^(.*),( )*$/,
    SPINNER_ICON = 'spinnercircle-anim',
    MIN_SHOWUP = 500;
/*jshint proto:false */

module.exports = function (window) {

    window._ITSAmodules || Object.protectedProp(window, '_ITSAmodules', createHashMap());

    if (window._ITSAmodules.IO_Transfer) {
        return window._ITSAmodules.IO_Transfer; // IO_Transfer was already created
    }

    var IO = require('../io.js')(window),

    /*
     * Adds properties to the xhr-object: in case of streaming,
     * xhr._parseStream=function is created to parse streamed data.
     *
     * @method _progressHandle
     * @param xhr {Object} containing the xhr-instance
     * @param props {Object} the propertie-object that is added too xhr and can be expanded
     * @param options {Object} options of the request
     * @private
    */
    _entendXHR = function(xhr, props, options /*, promise */) {
        var isarray, isobject, parialdata, regexpcomma, followingstream;
        if ((typeof options.streamback === 'function') && options.headers && (options.headers.Accept==='application/json')) {
            console.log(NAME, 'entendXHR');
            xhr._parseStream = function(streamData) {
                console.log(NAME, 'entendXHR --> _parseStream');
                // first step is to determine if the final response would be an array or an object
                // partial responses should be expanded to the same type
                if (!followingstream) {
                    isarray = REGEXP_ARRAY.test(streamData);
                    isarray || (isobject = REGEXP_OBJECT.test(streamData));
                }
                try {
                    if (isarray || isobject) {
                        regexpcomma = streamData.match(REGEXP_REMOVE_LAST_COMMA);
                        parialdata = regexpcomma ? streamData.match(REGEXP_REMOVE_LAST_COMMA)[1] : streamData;
                    }
                    else {
                        parialdata = streamData;
                    }
                    parialdata = (followingstream && isarray ? '[' : '') + (followingstream && isobject ? '{' : '') + parialdata + (regexpcomma && isarray ? ']' : '') + (regexpcomma && isobject ? '}' : '');
                    // note: parsing will fail for the last streamed part, because there will be a double ] or }
                    streamData = JSON.parse(parialdata, (options.parseJSONDate) ? REVIVER : null);
                }
                catch(err) {
                    console.warn(NAME, err);
                }
                followingstream = true;
                return streamData;
            };
        }
        return xhr;
    };

    IO._xhrList.push(_entendXHR);

    /**
     * Performs an AJAX GET request.  Shortcut for a call to [`xhr`](#method_xhr) with `method` set to  `'GET'`.
     * Additional parameters can be on the url (with questionmark), through `params`, or both.
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note: `params` should be a plain object with only primitive types which are transformed into key/value pairs.
     *
     * @method get
     * @param url {String} URL of the resource server
     * @param [params] {Object} additional parameters.
     *        should be a plain object with only primitive types which are transformed into key/value pairs.
     * @param [options] {Object}
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.responseType] {String} Force the response type.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.preventCache=false] {boolean} whether to prevent caching --> a timestamp is added by parameter _ts
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * xhr {XMLHttpRequest|XDomainRequest} xhr-response
     * on failure an Error object
        * reason {Error}
    */
    IO.get = function (url, options) {
        console.log(NAME, 'get --> '+url);
        var ioPromise, returnPromise;
        options || (options={});
        options.url = url;
        options.method = 'GET';
        // delete hidden property `data`: don't want accedentially to be used
        delete options.data;
        if (options.preventCache) {
            url += (url.contains('?') ? '&' : '?') + '_ts=' + Date.now();
        }
        ioPromise = this.request(options);
        returnPromise = ioPromise.then(
            function(xhrResponse) {
                return xhrResponse.responseText;
            }
        );
        // set `abort` to the thennable-promise:
        returnPromise.abort = ioPromise.abort;
        return returnPromise;
    };

    /**
     * Performs an AJAX request with the GET HTTP method and expects a JSON-object.
     * The resolved Promise-callback returns an object (JSON-parsed serverresponse).
     *
     * Additional request-parameters can be on the url (with questionmark), through `params`, or both.
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note1: If you expect the server to response with data that consist of Date-properties, you should set `options.parseJSONDate` true.
     *        Parsing takes a bit longer, but it will generate trully Date-objects.
     * Note2: CORS is supported, as long as the responseserver is set up to:
     *       a) has a response header which allows the clientdomain:
     *          header('Access-Control-Allow-Origin: http://www.some-site.com'); or header('Access-Control-Allow-Origin: *');
     *       b) in cae you have set a custom HEADER (through 'options'), the responseserver MUST listen and respond
     *          to requests with the OPTION-method
     *       More info:  allows to send to your domain: see http://remysharp.com/2011/04/21/getting-cors-working/
     *
     * @method read
     * @param url {String} URL of the resource server
     * @param [params] {Object} additional parameters.
     * @param [options] {Object} See also: [`I.io`](#method_xhr)
     *    can be ignored, even if streams are used --> the returned Promise will always hold all data
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.parseJSONDate=false] {boolean} Whether the server returns JSON-stringified data which has Date-objects.
     *    @param [options.parseProto] {Object} to set the prototype of any object.
     *    @param [options.preventCache=false] {boolean} whether to prevent caching --> a timestamp is added by parameter _ts
     *    @param [options.parseProtoCheck] {Function} to determine in what case the specified `parseProto` should be set as the prototype.
     *            The function accepts the `object` as argument and should return a trully value in order to set the prototype.
     *            When not specified, `parseProto` will always be applied (if `parseProto`is defined)
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * Object received data
     * on failure an Error object
        * reason {Error}
    */
    IO.read = function(url, params, options) {
        console.log(NAME, 'read  --> '+url+' params: '+JSON.stringify(params));
        var ioPromise, returnPromise;
        options || (options={});
        options.headers || (options.headers={});
        options.url = url;
        options.method = 'GET';
        options.data = params;
        if (options.preventCache) {
            options.data || (options.data={});
            options.data._ts = Date.now();
        }
        options.headers.Accept = 'application/json';
        // we don't want the user to re-specify the server's responsetype:
        delete options.responseType;
        ioPromise = this.request(options);
        returnPromise = ioPromise.then(
            function(xhrResponse) {
                // not 'try' 'catch', because, if parsing fails, we actually WANT the promise to be rejected
                // we also need to re-attach the 'abort-handle'
                console.log(NAME, 'read returns with: '+JSON.stringify(xhrResponse.responseText));
                // xhrResponse.responseText should be 'application/json' --> if it is not,
                // JSON.parse throws an error, but that's what we want: the Promise would reject
                if (options.parseProto) {
                    return JSON.parse(xhrResponse.responseText, REVIVER_PROTOTYPED.rbind(null, options.parseProto, options.parseProtoCheck, options.parseJSONDate));
                }
                return JSON.parse(xhrResponse.responseText, (options.parseJSONDate) ? REVIVER : null);
            }
        );
        // set `abort` to the thennable-promise:
        returnPromise.abort = ioPromise.abort;
        return returnPromise;
    };


    /**
     * Sends data (object) which will be JSON-stringified before sending.
     * Performs an AJAX request with the PUT HTTP method by default.
     * When options.allfields is `false`, it will use the POST-method: see Note2.
     *
     * The 'content-type' of the header is set to 'application/json', overruling manually options.
     *
     * 'data' is send as 'body.data' and should be JSON-parsed at the server.
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note1: The server needs to inspect the bodyparam: 'action', which always equals 'update'.
     *        'body.action' is the way to distinquish 'I.IO.updateObject' from 'I.IO.insertObject'.
     *        On purpose, we didn't make this distinction through a custom CONTENT-HEADER, because
     *        that would lead into a more complicated CORS-setup (see Note3)
     * Note2: By default this method uses the PUT-request: which is preferable is you send the WHOLE object.
     *        if you send part of the fields, set `options.allfields`=false.
     *        This will lead into using the POST-method.
     *        More about HTTP-methods: https://stormpath.com/blog/put-or-post/
     * Note3: CORS is supported, as long as the responseserver is set up to:
     *        a) has a response header which allows the clientdomain:
     *           header('Access-Control-Allow-Origin: http://www.some-site.com'); or header('Access-Control-Allow-Origin: *');
     *        b) in cae you have set a custom HEADER (through 'options'), the responseserver MUST listen and respond
     *           to requests with the OPTION-method
     *        More info:  allows to send to your domain: see http://remysharp.com/2011/04/21/getting-cors-working/
     * Note4: If the server response JSON-stringified data, the Promise resolves with a JS-Object. If you expect this object
     *        to consist of Date-properties, you should set `options.parseJSONDate` true. Parsing takes a bit longer, but it will
     *        generate trully Date-objects.
     *
     *
     * @method update
     * @param url {String} URL of the resource server
     * @param data {Object|Promise} Data to be sent, might be a Promise which resolves with the data-object.
     * @param [options] {Object} See also: [`I.io`](#method_xhr)
     *    @param [options.allfields=true] {boolean} to specify that all the object-fields are sent.
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.parseJSONDate=false] {boolean} Whether the server returns JSON-stringified data which has Date-objects.
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * response {Object} usually, the final object-data, possibly modified
     * on failure an Error object
        * reason {Error}
    */

    /**
     * Performs an AJAX request with the POST HTTP method by default.
     * When options.allfields is `true`, it will use the PUT-method: see Note2.
     * The send data is an object which will be JSON-stringified before sending.
     *
     * The 'content-type' of the header is set to 'application/json', overruling manually options.
     *
     * 'data' is send as 'body.data' and should be JSON-parsed at the server.
     * 'body.action' has the value 'insert'
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note1: The server needs to inspect the bodyparam: 'action', which always equals 'insert'.
     *        'body.action' is the way to distinquish 'I.IO.insertObject' from 'I.IO.updateObject'.
     *        On purpose, we didn't make this distinction through a custom CONTENT-HEADER, because
     *        that would lead into a more complicated CORS-setup (see Note3)
     * Note2: By default this method uses the POST-request: which is preferable if you don't know all the fields (like its unique id).
     *        if you send ALL the fields, set `options.allfields`=true.
     *        This will lead into using the PUT-method.
     *        More about HTTP-methods: https://stormpath.com/blog/put-or-post/
     * Note3: CORS is supported, as long as the responseserver is set up to:
     *        a) has a response header which allows the clientdomain:
     *           header('Access-Control-Allow-Origin: http://www.some-site.com'); or header('Access-Control-Allow-Origin: *');
     *        b) in cae you have set a custom HEADER (through 'options'), the responseserver MUST listen and respond
     *           to requests with the OPTION-method
     *        More info:  allows to send to your domain: see http://remysharp.com/2011/04/21/getting-cors-working/
     * Note4: If the server response JSON-stringified data, the Promise resolves with a JS-Object. If you expect this object
     *        to consist of Date-properties, you should set `options.parseJSONDate` true. Parsing takes a bit longer, but it will
     *        generate trully Date-objects.
     *
     * @method insert
     * @param url {String} URL of the resource server
     * @param data {Object|Promise} Data to be sent, might be a Promise which resolves with the data-object.
     * @param [options] {Object} See also: [`I.io`](#method_xhr)
     *    @param [options.allfields=false] {boolean} to specify that all the object-fields are sent.
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.parseJSONDate=false] {boolean} Whether the server returns JSON-stringified data which has Date-objects.
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * response {Object} usually, the final object-data, possibly modified, holding the key
     * on failure an Error object
        * reason {Error}
    */

    /**
     * Performs an AJAX request with the PUT HTTP method by default.
     * When options.allfields is `false`, it will use the POST-method: see Note2.
     * The send data is an object which will be JSON-stringified before sending.
     *
     * The 'content-type' of the header is set to 'application/json', overruling manually options.
     *
     * 'data' is send as 'body.data' and should be JSON-parsed at the server.
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note1: By default this method uses the PUT-request: which is preferable is you send the WHOLE object.
     *        if you send part of the fields, set `options.allfields`=false.
     *        This will lead into using the POST-method.
     *        More about HTTP-methods: https://stormpath.com/blog/put-or-post/
     * Note2: CORS is supported, as long as the responseserver is set up to:
     *        a) has a response header which allows the clientdomain:
     *           header('Access-Control-Allow-Origin: http://www.some-site.com'); or header('Access-Control-Allow-Origin: *');
     *        b) in cae you have set a custom HEADER (through 'options'), the responseserver MUST listen and respond
     *           to requests with the OPTION-method
     *        More info:  allows to send to your domain: see http://remysharp.com/2011/04/21/getting-cors-working/
     * Note3: If the server response JSON-stringified data, the Promise resolves with a JS-Object. If you expect this object
     *        to consist of Date-properties, you should set `options.parseJSONDate` true. Parsing takes a bit longer, but it will
     *        generate trully Date-objects.
     *
     * @method send
     * @param url {String} URL of the resource server
     * @param data {Object} Data to be sent.
     * @param [options] {Object} See also: [`I.io`](#method_xhr)
     *    @param [options.allfields=true] {boolean} to specify that all the object-fields are sent.
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.parseJSONDate=false] {boolean} Whether the server returns JSON-stringified data which has Date-objects.
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * response {Object|String} any response you want the server to return.
                   If the server send back a JSON-stringified object,
                   it will be parsed to return as a full object
                   You could set `options.parseJSONDate` true, it you want ISO8601-dates to be parsed as trully Date-objects
     * on failure an Error object
        * reason {Error}
    */

    ['update', 'insert', 'send'].forEach(
        function (verb) {
            IO[verb] = function (url, data, options) {
                console.log(NAME, verb+' --> '+url+' data: '+JSON.stringify(data));
                var instance = this,
                    allfields, useallfields, parseJSONDate, ioPromise, returnPromise;
                options || (options={});
                allfields = options.allfields,
                useallfields = (typeof allfields==='boolean') ? allfields : (verb!=='insert');
                parseJSONDate = options.parseJSONDate;
                options.url = url;
                options.method = useallfields ? 'PUT' : 'POST';
                options.data = data;
                options.headers || (options.headers={});
                options.headers[CONTENT_TYPE] = MIME_JSON;
                parseJSONDate && (options.headers['X-JSONDate']="true");
                if (verb!=='send') {
                    options.headers.Accept = 'application/json';
                    // set options.action
                    options.headers['X-Action'] = verb;
                    // we don't want the user to re-specify the server's responsetype:
                    delete options.responseType;
                }
                ioPromise = instance.request(options);
                returnPromise = ioPromise.then(
                    function(xhrResponse) {
                        if (verb==='send') {
                            return xhrResponse.responseText;
                        }
                        // In case of `insert` or `update`
                        // xhrResponse.responseText should be 'application/json' --> if it is not,
                        // JSON.parse throws an error, but that's what we want: the Promise would reject
                        return JSON.parse(xhrResponse.responseText, parseJSONDate ? REVIVER : null);
                    }
                );
                // set `abort` to the thennable-promise:
                returnPromise.abort = ioPromise.abort;
                return returnPromise;
            };
        }
    );

    /**
     * Performs an AJAX DELETE request.  Shortcut for a call to [`xhr`](#method_xhr) with `method` set to  `'DELETE'`.
     *
     * The Promise gets fulfilled if the server responses with `STATUS-CODE` in the 200-range (excluded 204).
     * It will be rejected if a timeout occurs (see `options.timeout`), or if `xhr.abort()` gets invoked.
     *
     * Note: `data` should be a plain object with only primitive types which are transformed into key/value pairs.
     *
     * @method delete
     * @param url {String} URL of the resource server
     * @param deleteKey {Object} Indentification of the id that has to be deleted. Typically an object like: {id: 12}
     *                  This object will be passed as the request params.
     * @param [options] {Object}
     *    @param [options.url] {String} The url to which the request is sent.
     *    @param [options.sync=false] {boolean} By default, all requests are sent asynchronously. To send synchronous requests, set to true.
     *    @param [options.params] {Object} Data to be sent to the server.
     *    @param [options.body] {Object} The content for the request body for POST method.
     *    @param [options.headers] {Object} HTTP request headers.
     *    @param [options.timeout=3000] {Number} to timeout the request, leading into a rejected Promise.
     *    @param [options.withCredentials=false] {boolean} Whether or not to send credentials on the request.
     *    @param [options.parseJSONDate=false] {boolean} Whether the server returns JSON-stringified data which has Date-objects.
     *    @param [options.stayActive] {Number} minimal time the request should be pending, even if IO has finished
     * @return {Promise}
     * on success:
        * response {Object|String} any response you want the server to return.
                   If the server send back a JSON-stringified object,
                   it will be parsed to return as a full object
                   You could set `options.parseJSONDate` true, it you want ISO8601-dates to be parsed as trully Date-objects
     * on failure an Error object
        * reason {Error}
    */

    IO[DELETE] = function (url, deleteKey, options) {
        console.log(NAME, 'delete --> '+url+' deleteKey: '+JSON.stringify(deleteKey));
        var ioPromise, returnPromise;
        options || (options={});
        options.url = url;
        // method will be uppercased by IO.xhr
        options.method = DELETE;
        options.data = deleteKey;
        delete options.responseType;
        ioPromise = this.request(options);
        returnPromise = ioPromise.then(
            function(xhrResponse) {
                var response = xhrResponse.responseText;
                try {
                    response = JSON.parse(response, (options.parseJSONDate) ? REVIVER : null);
                }
                catch(err) {}
                return response;
            }
        );
        // set `abort` to the thennable-promise:
        returnPromise.abort = ioPromise.abort;
        return returnPromise;
    };

    window._ITSAmodules.IO_Transfer = IO;

    return IO;
};