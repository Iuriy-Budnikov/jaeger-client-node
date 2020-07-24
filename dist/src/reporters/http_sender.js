'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();
// Copyright (c) 2018 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
// in compliance with the License. You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License
// is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
// or implied. See the License for the specific language governing permissions and limitations under
// the License.

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _https = require('https');

var _https2 = _interopRequireDefault(_https);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _url = require('url');

var URL = _interopRequireWildcard(_url);

var _thriftrw = require('thriftrw');

var _logger = require('../logger.js');

var _logger2 = _interopRequireDefault(_logger);

var _sender_utils = require('./sender_utils.js');

var _sender_utils2 = _interopRequireDefault(_sender_utils);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DEFAULT_PATH = '/api/traces';
var DEFAULT_PORT = 14268;
var DEFAULT_TIMEOUT_MS = 5000;
var DEFAULT_MAX_SPAN_BATCH_SIZE = 100;

var HTTPSender = function () {
  function HTTPSender() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, HTTPSender);

    this._url = URL.parse(options.endpoint);
    this._username = options.username;
    this._password = options.password;
    this._timeoutMS = options.timeoutMS || DEFAULT_TIMEOUT_MS;
    this._httpAgent = this._url.protocol === 'https:' ? new _https2.default.Agent({ keepAlive: true }) : new _http2.default.Agent({ keepAlive: true });

    this._maxSpanBatchSize = options.maxSpanBatchSize || DEFAULT_MAX_SPAN_BATCH_SIZE;

    this._logger = options.logger || new _logger2.default();
    this._jaegerThrift = new _thriftrw.Thrift({
      source: '# Copyright (c) 2016 Uber Technologies, Inc.\n' + '#\n' + '# Permission is hereby granted, free of charge, to any person obtaining a copy\n' + '# of this software and associated documentation files (the "Software"), to deal\n' + '# in the Software without restriction, including without limitation the rights\n' + '# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' + '# copies of the Software, and to permit persons to whom the Software is\n' + '# furnished to do so, subject to the following conditions:\n' + '#\n' + '# The above copyright notice and this permission notice shall be included in\n' + '# all copies or substantial portions of the Software.\n' + '#\n' + '# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' + '# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' + '# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' + '# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' + '# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' + '# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n' + '# THE SOFTWARE.\n' + '\n' + 'namespace java com.uber.jaeger.thriftjava\n' + '\n' + '# TagType denotes the type of a Tag\'s value.\n' + 'enum TagType { STRING, DOUBLE, BOOL, LONG, BINARY }\n' + '\n' + '# Tag is a basic strongly typed key/value pair. It has been flattened to reduce the use of pointers in golang\n' + 'struct Tag {\n' + '  1: required string  key\n' + '  2: required TagType vType\n' + '  3: optional string  vStr\n' + '  4: optional double  vDouble\n' + '  5: optional bool    vBool\n' + '  6: optional i64     vLong\n' + '  7: optional binary  vBinary\n' + '}\n' + '\n' + '# Log is a timed even with an arbitrary set of tags.\n' + 'struct Log {\n' + '  1: required i64       timestamp\n' + '  2: required list<Tag> fields\n' + '}\n' + '\n' + 'enum SpanRefType { CHILD_OF, FOLLOWS_FROM }\n' + '\n' + '# SpanRef describes causal relationship of the current span to another span (e.g. \'child-of\')\n' + 'struct SpanRef {\n' + '  1: required SpanRefType refType\n' + '  2: required i64         traceIdLow\n' + '  3: required i64         traceIdHigh\n' + '  4: required i64         spanId\n' + '}\n' + '\n' + '# Span represents a named unit of work performed by a service.\n' + 'struct Span {\n' + '  1:  required i64           traceIdLow   # the least significant 64 bits of a traceID\n' + '  2:  required i64           traceIdHigh  # the most significant 64 bits of a traceID; 0 when only 64bit IDs are used\n' + '  3:  required i64           spanId       # unique span id (only unique within a given trace)\n' + '  4:  required i64           parentSpanId # since nearly all spans will have parents spans, CHILD_OF refs do not have to be explicit\n' + '  5:  required string        operationName\n' + '  6:  optional list<SpanRef> references   # causal references to other spans\n' + '  7:  required i32           flags        # a bit field used to propagate sampling decisions. 1 signifies a SAMPLED span, 2 signifies a DEBUG span.\n' + '  8:  required i64           startTime\n' + '  9:  required i64           duration\n' + '  10: optional list<Tag>     tags\n' + '  11: optional list<Log>     logs\n' + '}\n' + '\n' + '# Process describes the traced process/service that emits spans.\n' + 'struct Process {\n' + '  1: required string    serviceName\n' + '  2: optional list<Tag> tags\n' + '}\n' + '\n' + '# Batch is a collection of spans reported out of process.\n' + 'struct Batch {\n' + '  1: required Process    process\n' + '  2: required list<Span> spans\n' + '}\n' + '\n' + '# BatchSubmitResponse is the response on submitting a batch. \n' + 'struct BatchSubmitResponse {\n' + '    1: required bool ok   # The Collector\'s client is expected to only log (or emit a counter) when not ok equals false\n' + '}\n' + '\n' + 'service Collector  {\n' + '    list<BatchSubmitResponse> submitBatches(1: list<Batch> batches)\n' + '}\n',
      allowOptionalArguments: true
    });

    this._httpOptions = {
      protocol: this._url.protocol,
      hostname: this._url.hostname,
      port: this._url.port,
      path: this._url.pathname,
      method: 'POST',
      auth: this._username && this._password ? this._username + ':' + this._password : undefined,
      headers: {
        'Content-Type': 'application/x-thrift',
        Connection: 'keep-alive'
      },
      agent: this._httpAgent,
      timeout: this._timeoutMS
    };
  }

  _createClass(HTTPSender, [{
    key: 'setProcess',
    value: function setProcess(process) {
      // Go ahead and initialize the Thrift batch that we will reuse for each
      // flush.
      this._batch = new this._jaegerThrift.Batch({
        process: _sender_utils2.default.convertProcessToThrift(this._jaegerThrift, process),
        spans: []
      });
    }
  }, {
    key: 'append',
    value: function append(span, callback) {
      this._batch.spans.push(new this._jaegerThrift.Span(span));

      if (this._batch.spans.length >= this._maxSpanBatchSize) {
        this.flush(callback);
        return;
      }
      _sender_utils2.default.invokeCallback(callback, 0);
    }
  }, {
    key: 'flush',
    value: function flush(callback) {
      var _this = this;

      var numSpans = this._batch.spans.length;
      if (!numSpans) {
        _sender_utils2.default.invokeCallback(callback, 0);
        return;
      }

      var result = this._jaegerThrift.Batch.rw.toBuffer(this._batch);
      this._reset(); // clear buffer for new spans, even if Thrift conversion fails

      if (result.err) {
        _sender_utils2.default.invokeCallback(callback, numSpans, 'Error encoding Thrift batch: ' + result.err);
        return;
      }

      var requester = this._url.protocol === 'https:' ? _https2.default.request : _http2.default.request;

      var req = requester(this._httpOptions, function (resp) {
        // consume response data to free up memory
        resp.resume();
        _sender_utils2.default.invokeCallback(callback, numSpans);
      });

      req.on('error', function (err) {
        var error = 'error sending spans over HTTP: ' + err;
        _this._logger.error(error);
        _sender_utils2.default.invokeCallback(callback, numSpans, error);
      });
      req.write(result.value);
      req.end();
    }
  }, {
    key: '_reset',
    value: function _reset() {
      this._batch.spans = [];
    }
  }, {
    key: 'close',
    value: function close() {
      // Older node versions don't have this.
      if (this._httpAgent.destroy) {
        this._httpAgent.destroy();
      }
    }
  }]);

  return HTTPSender;
}();

exports.default = HTTPSender;
//# sourceMappingURL=http_sender.js.map