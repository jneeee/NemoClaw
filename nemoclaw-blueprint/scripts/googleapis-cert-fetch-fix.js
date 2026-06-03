// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// googleapis-cert-fetch-fix.js — keep Google public signing-certificate
// fetches on NemoClaw's sandbox proxy path when callers attach a per-request
// dispatcher.

(function () {
  'use strict';

  if (process.env.OPENSHELL_SANDBOX !== '1') return;

  var CERT_HOSTS = {
    'www.googleapis.com': true,
  };
  var CERT_PATH_PREFIXES = [
    '/oauth2/v1/certs',
    '/oauth2/v3/certs',
    '/robot/v1/metadata/x509/',
    '/service_accounts/v1/metadata/x509/',
  ];

  function toUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input);
      if (input && typeof input === 'object') {
        if (typeof input.href === 'string' && typeof input.hostname === 'string') return input;
        if (typeof input.url === 'string') return new URL(input.url);
      }
    } catch (_e) {
      // Let fetch report invalid inputs normally.
    }
    return null;
  }

  function isGoogleCertUrl(url) {
    if (!url || !CERT_HOSTS[url.hostname]) return false;
    for (var i = 0; i < CERT_PATH_PREFIXES.length; i++) {
      if (url.pathname.indexOf(CERT_PATH_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function wrapFetch(fetchImpl) {
    if (typeof fetchImpl !== 'function' || fetchImpl.__nemoclawGoogleapisCertFetchFix) {
      return fetchImpl;
    }

    var wrapped = function (input, init) {
      if (
        init &&
        typeof init === 'object' &&
        (init.dispatcher || init.agent) &&
        isGoogleCertUrl(toUrl(input))
      ) {
        var nextInit = {};
        for (var key in init) {
          if (Object.prototype.hasOwnProperty.call(init, key)) nextInit[key] = init[key];
        }
        delete nextInit.dispatcher;
        delete nextInit.agent;
        return fetchImpl.call(this, input, nextInit);
      }
      return fetchImpl.call(this, input, init);
    };
    wrapped.__nemoclawGoogleapisCertFetchFix = true;
    return wrapped;
  }

  globalThis.fetch = wrapFetch(globalThis.fetch);

  try {
    var undici = require('undici');
    if (undici && typeof undici.fetch === 'function') {
      undici.fetch = wrapFetch(undici.fetch);
    }
  } catch (_e) {
    // Node's global fetch is sufficient when the standalone module is absent.
  }
})();
