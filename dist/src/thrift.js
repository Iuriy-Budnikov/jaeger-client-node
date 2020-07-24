'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();
// Copyright (c) 2016 Uber Technologies, Inc.
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

var _opentracing = require('opentracing');

var opentracing = _interopRequireWildcard(_opentracing);

var _thriftrw = require('thriftrw');

var _util = require('./util.js');

var _util2 = _interopRequireDefault(_util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ThriftUtils = function () {
  function ThriftUtils() {
    _classCallCheck(this, ThriftUtils);
  }

  _createClass(ThriftUtils, null, [{
    key: 'getThriftTags',
    value: function getThriftTags(initialTags) {
      var thriftTags = [];
      for (var i = 0; i < initialTags.length; i++) {
        var tag = initialTags[i];

        var key = tag.key;

        var vLong = ThriftUtils.emptyBuffer;
        var vBinary = ThriftUtils.emptyBuffer;
        var vBool = false;
        var vDouble = 0;
        var vStr = '';

        var vType = '';
        var valueType = _typeof(tag.value);
        if (valueType === 'number') {
          vType = ThriftUtils._thrift.TagType.DOUBLE;
          vDouble = tag.value;
        } else if (valueType === 'boolean') {
          vType = ThriftUtils._thrift.TagType.BOOL;
          vBool = tag.value;
        } else if (tag.value instanceof Buffer) {
          vType = ThriftUtils._thrift.TagType.BINARY;
          vBinary = tag.value;
        } else if (valueType === 'object') {
          vType = ThriftUtils._thrift.TagType.STRING;
          vStr = JSON.stringify(tag.value);
        } else {
          vType = ThriftUtils._thrift.TagType.STRING;
          if (valueType === 'string') {
            vStr = tag.value;
          } else {
            vStr = String(tag.value);
          }
        }

        thriftTags.push({
          key: key,
          vType: vType,
          vStr: vStr,
          vDouble: vDouble,
          vBool: vBool,
          vLong: vLong,
          vBinary: vBinary
        });
      }

      return thriftTags;
    }
  }, {
    key: 'getThriftLogs',
    value: function getThriftLogs(logs) {
      var thriftLogs = [];
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        thriftLogs.push({
          timestamp: _util2.default.encodeInt64(log.timestamp * 1000), // to microseconds
          fields: ThriftUtils.getThriftTags(log.fields)
        });
      }

      return thriftLogs;
    }
  }, {
    key: 'spanRefsToThriftRefs',
    value: function spanRefsToThriftRefs(refs) {
      var thriftRefs = [];
      for (var i = 0; i < refs.length; i++) {
        var refEnum = void 0;
        var ref = refs[i];
        var context = refs[i].referencedContext();

        if (ref.type() === opentracing.REFERENCE_CHILD_OF) {
          refEnum = ThriftUtils._thrift.SpanRefType.CHILD_OF;
        } else if (ref.type() === opentracing.REFERENCE_FOLLOWS_FROM) {
          refEnum = ThriftUtils._thrift.SpanRefType.FOLLOWS_FROM;
        } else {
          continue;
        }

        thriftRefs.push({
          refType: refEnum,
          traceIdLow: ThriftUtils.getTraceIdLow(context.traceId),
          traceIdHigh: ThriftUtils.getTraceIdHigh(context.traceId),
          spanId: context.spanId
        });
      }

      return thriftRefs;
    }
  }, {
    key: 'getTraceIdLow',
    value: function getTraceIdLow(traceId) {
      if (traceId != null) {
        return traceId.slice(-8);
      }

      return ThriftUtils.emptyBuffer;
    }
  }, {
    key: 'getTraceIdHigh',
    value: function getTraceIdHigh(traceId) {
      if (traceId != null && traceId.length > 8) {
        return traceId.slice(-16, -8);
      }

      return ThriftUtils.emptyBuffer;
    }
  }, {
    key: 'spanToThrift',
    value: function spanToThrift(span) {
      var tags = ThriftUtils.getThriftTags(span._tags);
      var logs = ThriftUtils.getThriftLogs(span._logs);
      var unsigned = true;

      return {
        traceIdLow: ThriftUtils.getTraceIdLow(span._spanContext.traceId),
        traceIdHigh: ThriftUtils.getTraceIdHigh(span._spanContext.traceId),
        spanId: span._spanContext.spanId,
        parentSpanId: span._spanContext.parentId || ThriftUtils.emptyBuffer,
        operationName: span._operationName,
        references: ThriftUtils.spanRefsToThriftRefs(span._references),
        flags: span._spanContext.flags,
        startTime: _util2.default.encodeInt64(span._startTime * 1000), // to microseconds
        duration: _util2.default.encodeInt64(span._duration * 1000), // to microseconds
        tags: tags,
        logs: logs
      };
    }
  }]);

  return ThriftUtils;
}();

ThriftUtils._thrift = new _thriftrw.Thrift({
  source: '# Copyright (c) 2016 Uber Technologies, Inc.\n' + '#\n' + '# Permission is hereby granted, free of charge, to any person obtaining a copy\n' + '# of this software and associated documentation files (the "Software"), to deal\n' + '# in the Software without restriction, including without limitation the rights\n' + '# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' + '# copies of the Software, and to permit persons to whom the Software is\n' + '# furnished to do so, subject to the following conditions:\n' + '#\n' + '# The above copyright notice and this permission notice shall be included in\n' + '# all copies or substantial portions of the Software.\n' + '#\n' + '# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' + '# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' + '# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' + '# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' + '# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' + '# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n' + '# THE SOFTWARE.\n' + '\n' + 'namespace java com.uber.jaeger.thriftjava\n' + '\n' + '# TagType denotes the type of a Tag\'s value.\n' + 'enum TagType { STRING, DOUBLE, BOOL, LONG, BINARY }\n' + '\n' + '# Tag is a basic strongly typed key/value pair. It has been flattened to reduce the use of pointers in golang\n' + 'struct Tag {\n' + '  1: required string  key\n' + '  2: required TagType vType\n' + '  3: optional string  vStr\n' + '  4: optional double  vDouble\n' + '  5: optional bool    vBool\n' + '  6: optional i64     vLong\n' + '  7: optional binary  vBinary\n' + '}\n' + '\n' + '# Log is a timed even with an arbitrary set of tags.\n' + 'struct Log {\n' + '  1: required i64       timestamp\n' + '  2: required list<Tag> fields\n' + '}\n' + '\n' + 'enum SpanRefType { CHILD_OF, FOLLOWS_FROM }\n' + '\n' + '# SpanRef describes causal relationship of the current span to another span (e.g. \'child-of\')\n' + 'struct SpanRef {\n' + '  1: required SpanRefType refType\n' + '  2: required i64         traceIdLow\n' + '  3: required i64         traceIdHigh\n' + '  4: required i64         spanId\n' + '}\n' + '\n' + '# Span represents a named unit of work performed by a service.\n' + 'struct Span {\n' + '  1:  required i64           traceIdLow   # the least significant 64 bits of a traceID\n' + '  2:  required i64           traceIdHigh  # the most significant 64 bits of a traceID; 0 when only 64bit IDs are used\n' + '  3:  required i64           spanId       # unique span id (only unique within a given trace)\n' + '  4:  required i64           parentSpanId # since nearly all spans will have parents spans, CHILD_OF refs do not have to be explicit\n' + '  5:  required string        operationName\n' + '  6:  optional list<SpanRef> references   # causal references to other spans\n' + '  7:  required i32           flags        # a bit field used to propagate sampling decisions. 1 signifies a SAMPLED span, 2 signifies a DEBUG span.\n' + '  8:  required i64           startTime\n' + '  9:  required i64           duration\n' + '  10: optional list<Tag>     tags\n' + '  11: optional list<Log>     logs\n' + '}\n' + '\n' + '# Process describes the traced process/service that emits spans.\n' + 'struct Process {\n' + '  1: required string    serviceName\n' + '  2: optional list<Tag> tags\n' + '}\n' + '\n' + '# Batch is a collection of spans reported out of process.\n' + 'struct Batch {\n' + '  1: required Process    process\n' + '  2: required list<Span> spans\n' + '}\n' + '\n' + '# BatchSubmitResponse is the response on submitting a batch. \n' + 'struct BatchSubmitResponse {\n' + '    1: required bool ok   # The Collector\'s client is expected to only log (or emit a counter) when not ok equals false\n' + '}\n' + '\n' + 'service Collector  {\n' + '    list<BatchSubmitResponse> submitBatches(1: list<Batch> batches)\n' + '}\n',
  allowOptionalArguments: true
});
ThriftUtils.emptyBuffer = _util2.default.newBuffer(8);
exports.default = ThriftUtils;
//# sourceMappingURL=thrift.js.map