// @flow
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

import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { Thrift } from 'thriftrw';
import NullLogger from '../logger';
import SenderUtils from './sender_utils';
import Utils from '../util';

const HOST = 'localhost';
const PORT = 6832;
const SOCKET_TYPE = 'udp4';
const UDP_PACKET_MAX_LENGTH = 65000;

export default class UDPSender {
  _host: string;
  _port: number;
  _socketType: string;
  _maxPacketSize: number;
  _process: Process;
  _emitSpanBatchOverhead: number;
  _logger: Logger;
  _client: dgram$Socket;
  _agentThrift: Thrift;
  _jaegerThrift: Thrift;
  _batch: Batch;
  _thriftProcessMessage: any;
  _maxSpanBytes: number; // maxPacketSize - (batch + tags overhead)
  _totalSpanBytes: number; // size of currently batched spans as Thrift bytes

  constructor(options: any = {}) {
    this._host = options.host || HOST;
    this._port = options.port || PORT;
    this._socketType = options.socketType || SOCKET_TYPE;
    this._maxPacketSize = options.maxPacketSize || UDP_PACKET_MAX_LENGTH;
    this._logger = options.logger || new NullLogger();
    this._client = dgram.createSocket(this._socketType);
    this._client.on('error', err => {
      this._logger.error(`error sending spans over UDP: ${err}`);
    });
    this._agentThrift = new Thrift({
      entryPoint: path.join(__dirname, '../thriftrw-idl/agent.thrift'),
      allowOptionalArguments: true,
      allowFilesystemAccess: true,
    });
    this._jaegerThrift = new Thrift({
      source:
        '# Copyright (c) 2016 Uber Technologies, Inc.\n' +
        '#\n' +
        '# Permission is hereby granted, free of charge, to any person obtaining a copy\n' +
        '# of this software and associated documentation files (the "Software"), to deal\n' +
        '# in the Software without restriction, including without limitation the rights\n' +
        '# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' +
        '# copies of the Software, and to permit persons to whom the Software is\n' +
        '# furnished to do so, subject to the following conditions:\n' +
        '#\n' +
        '# The above copyright notice and this permission notice shall be included in\n' +
        '# all copies or substantial portions of the Software.\n' +
        '#\n' +
        '# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' +
        '# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' +
        '# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' +
        '# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' +
        '# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' +
        '# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n' +
        '# THE SOFTWARE.\n' +
        '\n' +
        'namespace java com.uber.jaeger.thriftjava\n' +
        '\n' +
        "# TagType denotes the type of a Tag's value.\n" +
        'enum TagType { STRING, DOUBLE, BOOL, LONG, BINARY }\n' +
        '\n' +
        '# Tag is a basic strongly typed key/value pair. It has been flattened to reduce the use of pointers in golang\n' +
        'struct Tag {\n' +
        '  1: required string  key\n' +
        '  2: required TagType vType\n' +
        '  3: optional string  vStr\n' +
        '  4: optional double  vDouble\n' +
        '  5: optional bool    vBool\n' +
        '  6: optional i64     vLong\n' +
        '  7: optional binary  vBinary\n' +
        '}\n' +
        '\n' +
        '# Log is a timed even with an arbitrary set of tags.\n' +
        'struct Log {\n' +
        '  1: required i64       timestamp\n' +
        '  2: required list<Tag> fields\n' +
        '}\n' +
        '\n' +
        'enum SpanRefType { CHILD_OF, FOLLOWS_FROM }\n' +
        '\n' +
        "# SpanRef describes causal relationship of the current span to another span (e.g. 'child-of')\n" +
        'struct SpanRef {\n' +
        '  1: required SpanRefType refType\n' +
        '  2: required i64         traceIdLow\n' +
        '  3: required i64         traceIdHigh\n' +
        '  4: required i64         spanId\n' +
        '}\n' +
        '\n' +
        '# Span represents a named unit of work performed by a service.\n' +
        'struct Span {\n' +
        '  1:  required i64           traceIdLow   # the least significant 64 bits of a traceID\n' +
        '  2:  required i64           traceIdHigh  # the most significant 64 bits of a traceID; 0 when only 64bit IDs are used\n' +
        '  3:  required i64           spanId       # unique span id (only unique within a given trace)\n' +
        '  4:  required i64           parentSpanId # since nearly all spans will have parents spans, CHILD_OF refs do not have to be explicit\n' +
        '  5:  required string        operationName\n' +
        '  6:  optional list<SpanRef> references   # causal references to other spans\n' +
        '  7:  required i32           flags        # a bit field used to propagate sampling decisions. 1 signifies a SAMPLED span, 2 signifies a DEBUG span.\n' +
        '  8:  required i64           startTime\n' +
        '  9:  required i64           duration\n' +
        '  10: optional list<Tag>     tags\n' +
        '  11: optional list<Log>     logs\n' +
        '}\n' +
        '\n' +
        '# Process describes the traced process/service that emits spans.\n' +
        'struct Process {\n' +
        '  1: required string    serviceName\n' +
        '  2: optional list<Tag> tags\n' +
        '}\n' +
        '\n' +
        '# Batch is a collection of spans reported out of process.\n' +
        'struct Batch {\n' +
        '  1: required Process    process\n' +
        '  2: required list<Span> spans\n' +
        '}\n' +
        '\n' +
        '# BatchSubmitResponse is the response on submitting a batch. \n' +
        'struct BatchSubmitResponse {\n' +
        "    1: required bool ok   # The Collector's client is expected to only log (or emit a counter) when not ok equals false\n" +
        '}\n' +
        '\n' +
        'service Collector  {\n' +
        '    list<BatchSubmitResponse> submitBatches(1: list<Batch> batches)\n' +
        '}\n',
      allowOptionalArguments: true,
    });
    this._totalSpanBytes = 0;
  }

  _calcBatchSize(batch: Batch) {
    return this._agentThrift.Agent.emitBatch.argumentsMessageRW.byteLength(
      this._convertBatchToThriftMessage()
    ).length;
  }

  _calcSpanSize(span: any): LengthResult {
    return this._jaegerThrift.Span.rw.byteLength(new this._jaegerThrift.Span(span));
  }

  setProcess(process: Process): void {
    // This function is only called once during reporter construction, and thus will
    // give us the length of the batch before any spans have been added to the span
    // list in batch.
    this._process = process;
    this._batch = {
      process: this._process,
      spans: [],
    };

    this._thriftProcessMessage = SenderUtils.convertProcessToThrift(this._jaegerThrift, process);
    this._emitSpanBatchOverhead = this._calcBatchSize(this._batch);
    this._maxSpanBytes = this._maxPacketSize - this._emitSpanBatchOverhead;
  }

  append(span: any, callback?: SenderCallback): void {
    const { err, length } = this._calcSpanSize(span);
    if (err) {
      SenderUtils.invokeCallback(callback, 1, `error converting span to Thrift: ${err}`);
      return;
    }
    const spanSize = length;
    if (spanSize > this._maxSpanBytes) {
      SenderUtils.invokeCallback(
        callback,
        1,
        `span size ${spanSize} is larger than maxSpanSize ${this._maxSpanBytes}`
      );
      return;
    }

    if (this._totalSpanBytes + spanSize <= this._maxSpanBytes) {
      this._batch.spans.push(span);
      this._totalSpanBytes += spanSize;
      if (this._totalSpanBytes < this._maxSpanBytes) {
        // still have space in the buffer, don't flush it yet
        SenderUtils.invokeCallback(callback, 0);
        return;
      }
      // buffer size === this._maxSpanBytes
      this.flush(callback);
      return;
    }

    this.flush((numSpans: number, err?: string) => {
      // TODO theoretically we can have buffer overflow here too, if many spans were appended during flush()
      this._batch.spans.push(span);
      this._totalSpanBytes += spanSize;
      SenderUtils.invokeCallback(callback, numSpans, err);
    });
  }

  flush(callback?: SenderCallback): void {
    const numSpans = this._batch.spans.length;
    if (!numSpans) {
      SenderUtils.invokeCallback(callback, 0);
      return;
    }

    const bufferLen = this._totalSpanBytes + this._emitSpanBatchOverhead;
    const thriftBuffer = Utils.newBuffer(bufferLen);
    const writeResult = this._agentThrift.Agent.emitBatch.argumentsMessageRW.writeInto(
      this._convertBatchToThriftMessage(),
      thriftBuffer,
      0
    );
    this._reset();

    if (writeResult.err) {
      SenderUtils.invokeCallback(callback, numSpans, `error writing Thrift object: ${writeResult.err}`);
      return;
    }

    // Having the error callback here does not prevent uncaught exception from being thrown,
    // that's why in the constructor we also add a general on('error') handler.
    this._client.send(thriftBuffer, 0, thriftBuffer.length, this._port, this._host, (err, sent) => {
      if (err) {
        const error: string =
          err &&
          `error sending spans over UDP: ${err}, packet size: ${writeResult.offset}, bytes sent: ${sent}`;
        SenderUtils.invokeCallback(callback, numSpans, error);
      } else {
        SenderUtils.invokeCallback(callback, numSpans);
      }
    });
  }

  _convertBatchToThriftMessage() {
    const spanMessages = [];
    for (let i = 0; i < this._batch.spans.length; i++) {
      const span = this._batch.spans[i];
      spanMessages.push(new this._jaegerThrift.Span(span));
    }

    return new this._agentThrift.Agent.emitBatch.ArgumentsMessage({
      version: 1,
      id: 0,
      body: {
        batch: new this._jaegerThrift.Batch({
          process: this._thriftProcessMessage,
          spans: spanMessages,
        }),
      },
    });
  }

  _reset() {
    this._batch.spans = [];
    this._totalSpanBytes = 0;
  }

  close(): void {
    this._client.close();
  }
}
