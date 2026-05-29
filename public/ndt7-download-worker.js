// workerMain is the WebWorker function that runs the ndt7 download test.
const workerMain = function(ev) {
  'use strict';
  const url = ev.data['///ndt/v7/download'];
  const sock = new WebSocket(url, 'net.measurementlab.ndt.v7');
  let now;
  if (typeof performance !== 'undefined' &&
      typeof performance.now === 'function') {
    now = () => performance.now();
  } else {
    now = () => Date.now();
  }
  downloadTest(sock, postMessage, now);
};

/**
 * downloadTest is a function that runs an ndt7 download test using the
 * passed-in websocket instance and the passed-in callback function.  The
 * socket and callback are passed in to enable testing and mocking.
 *
 * @param {WebSocket} sock - The WebSocket being read.
 * @param {function} postMessage - A function for messages to the main thread.
 * @param {function} now - A function returning a time in milliseconds.
 */
const downloadTest = function(sock, postMessage, now) {
  sock.onclose = function() {
    postClientMeasurement(total, start, now());
    postMessage({
      MsgType: 'complete',
    });
  };

  sock.onerror = function(ev) {
    postMessage({
      MsgType: 'error',
      Error: ev.type,
    });
  };

  let start = now();
  let previous = start;
  let total = 0;

  sock.onopen = function() {
    start = now();
    previous = start;
    total = 0;
    postMessage({
      MsgType: 'start',
      Data: {
        ClientStartTime: start,
      },
    });
  };

  sock.onmessage = function(ev) {
    total +=
        (typeof ev.data.size !== 'undefined') ? ev.data.size : ev.data.length;
    // Perform a client-side measurement 4 times per second.
    const t = now();
    const every = 250; // ms
    if (t - previous > every) {
      postClientMeasurement(total, start, t);
      previous = t;
    }

    // Pass along every server-side measurement.
    if (typeof ev.data === 'string') {
      postMessage({
        MsgType: 'measurement',
        ServerMessage: ev.data,
        Source: 'server',
      });
    }
  };

  function postClientMeasurement(totalBytes, startedAt, measuredAt) {
    const elapsedMs = Math.max(measuredAt - startedAt, 1);
    postMessage({
      MsgType: 'measurement',
      ClientData: {
        ElapsedTime: elapsedMs / 1000,
        NumBytes: totalBytes,
        MeanClientMbps: (totalBytes / elapsedMs) * 0.008,
      },
      Source: 'client',
    });
  }
};

// Node and browsers get onmessage defined differently.
if (typeof self !== 'undefined') {
  self.onmessage = workerMain;
} else if (typeof this !== 'undefined') {
  this.onmessage = workerMain;
} else if (typeof onmessage !== 'undefined') {
  onmessage = workerMain;
}
