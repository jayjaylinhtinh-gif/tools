/*
 * Teacher Tools shared platform layer.
 *
 * This file is the single seam between the UI and persistence. The prototype
 * stores data in localStorage, but every page and every builder goes through
 * the same APIs (theme, session, profiles, publishing) so the storage layer can
 * be replaced with authenticated backend calls without touching the UI code.
 */
(function (window, document) {
  'use strict';

  var KEYS = {
    theme: 'teacherTools.theme.v1',
    session: 'teacherTools.session.v1',
    profiles: 'teacherTools.profiles.v1',
    publications: 'teacherTools.publications.v1',
    publicationPrefix: 'teacherTools.publication.'
  };

  var EVENTS = {
    theme: 'teachertools:themechange',
    auth: 'teachertools:authchange',
    published: 'teachertools:published'
  };

  var DEFAULT_USER_ID = 'alex';
  var THEME_LIGHT = 'light';
  var THEME_DARK = 'dark';

  var TOOL_META = {
    listening:         { label: 'IELTS Listening', group: 'ielts', art: 'listening', kind: 'test',   detail: 'Listening practice test' },
    reading:           { label: 'IELTS Reading',   group: 'ielts', art: 'reading',   kind: 'test',   detail: 'Reading practice test' },
    writing:           { label: 'IELTS Writing',   group: 'ielts', art: 'writing',   kind: 'test',   detail: 'Writing practice test' },
    speaking:          { label: 'IELTS Speaking',  group: 'ielts', art: 'speaking',  kind: 'test',   detail: 'Speaking practice test' },
    'toeic-listening': { label: 'TOEIC Listening', group: 'toeic', art: 'listening', kind: 'test',   detail: 'TOEIC listening test' },
    'toeic-reading':   { label: 'TOEIC Reading',   group: 'toeic', art: 'reading',   kind: 'test',   detail: 'TOEIC reading test' },
    'toeic-writing':   { label: 'TOEIC Writing',   group: 'toeic', art: 'writing',   kind: 'test',   detail: 'TOEIC writing test' },
    'toeic-speaking':  { label: 'TOEIC Speaking',  group: 'toeic', art: 'speaking',  kind: 'test',   detail: 'TOEIC speaking test' },
    'multiple-choice': { label: 'Multiple Choice', group: 'general', art: 'quiz',    kind: 'quiz',   detail: 'Multiple-choice activity' },
    'drag-drop':       { label: 'Drag & Drop',     group: 'general', art: 'puzzle',  kind: 'activity', detail: 'Drag & drop activity' },
    'gap-filling':     { label: 'Gap-filling',     group: 'general', art: 'worksheet', kind: 'exercise', detail: 'Gap-filling exercise' },
    graduation:        { label: 'Graduation Test', group: 'others', art: 'exit',     kind: 'test',   detail: 'High school graduation test' },
    lesson:            { label: 'Lesson',          group: 'lessons', art: 'planner', kind: 'lesson', detail: 'Lesson materials' }
  };

  function readRaw(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }

  function writeRaw(key, value) {
    localStorage.setItem(key, value);
  }

  function removeRaw(key) {
    try { localStorage.removeItem(key); } catch (err) { /* storage unavailable */ }
  }

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    writeRaw(key, JSON.stringify(value));
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (err) {
      /* Older browsers ignore custom events; the direct calls still work. */
    }
  }

  /* ---------------------------------------------------------------- Theme */

  function normalizeTheme(value) {
    return value === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  }

  function storedTheme() {
    return normalizeTheme(readRaw(KEYS.theme));
  }

  function applyTheme(value, persist) {
    var next = normalizeTheme(value);
    var current = document.documentElement.getAttribute('data-theme');
    if (persist) {
      try { writeRaw(KEYS.theme, next); } catch (err) { /* keep the theme for this session */ }
    }
    document.documentElement.setAttribute('data-theme', next);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === THEME_DARK ? '#020363' : '#ffffff');
    if (current === next) return next;
    broadcastTheme(next);
    dispatch(EVENTS.theme, { theme: next });
    return next;
  }

  function getTheme() {
    return normalizeTheme(document.documentElement.getAttribute('data-theme') || storedTheme());
  }

  function setTheme(value) {
    return applyTheme(value, true);
  }

  function notifyFrame(frame, theme) {
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: 'teachertools:theme', theme: theme || getTheme() }, '*');
    } catch (err) {
      /* Cross-origin frames are ignored. */
    }
  }

  function broadcastTheme(theme) {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i += 1) notifyFrame(frames[i], theme);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data && data.type === 'teachertools:theme') {
      applyTheme(data.theme, false);
    }
  });

  window.addEventListener('storage', function (event) {
    if (event.key === KEYS.theme) applyTheme(storedTheme(), false);
  });

  /* -------------------------------------------------------------- Session */

  function readSession() {
    var raw = readRaw(KEYS.session);
    if (raw === null) return { userId: DEFAULT_USER_ID };
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.userId === 'string' && parsed.userId) return { userId: parsed.userId };
      return { userId: null };
    } catch (err) {
      return { userId: DEFAULT_USER_ID };
    }
  }

  function getUserId() {
    return readSession().userId;
  }

  function isSignedIn() {
    return !!getUserId();
  }

  function signIn(userId) {
    var id = String(userId || DEFAULT_USER_ID);
    try { writeJSON(KEYS.session, { userId: id }); } catch (err) { /* noop */ }
    dispatch(EVENTS.auth, { userId: id });
    return id;
  }

  function signOut() {
    try { writeJSON(KEYS.session, { userId: null }); } catch (err) { /* noop */ }
    dispatch(EVENTS.auth, { userId: null });
    return null;
  }

  window.addEventListener('storage', function (event) {
    if (event.key === KEYS.session) dispatch(EVENTS.auth, { userId: getUserId() });
  });

  /* ------------------------------------------------------------- Profiles */

  function profileOverrides() {
    var all = readJSON(KEYS.profiles, {});
    return all && typeof all === 'object' ? all : {};
  }

  function getProfile(id) {
    if (!id) return null;
    var all = profileOverrides();
    return all[id] && typeof all[id] === 'object' ? all[id] : null;
  }

  function saveProfile(id, patch) {
    if (!id) throw new Error('A user id is required.');
    var all = profileOverrides();
    var next = {};
    var previous = all[id] || {};
    var key;
    for (key in previous) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
    }
    for (key in patch || {}) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    all[id] = next;
    writeJSON(KEYS.profiles, all);
    return next;
  }

  /* ---------------------------------------------------------- Publishing */

  function publicationList() {
    var list = readJSON(KEYS.publications, []);
    if (!Array.isArray(list)) return [];
    return list.filter(function (item) { return item && typeof item === 'object' && item.id; });
  }

  function writePublicationList(list) {
    writeJSON(KEYS.publications, list);
  }

  function payloadKey(id) {
    return KEYS.publicationPrefix + id + '.html';
  }

  function hashString(value) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36) + '-' + value.length.toString(36);
  }

  function makeId() {
    return 'pub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function metaFor(toolId, input) {
    var base = TOOL_META[toolId] || {};
    return {
      label: input.label || base.label || toolId || 'Content',
      group: input.group || base.group || 'general',
      art: input.art || base.art || 'worksheet',
      kind: input.kind || base.kind || 'resource',
      detail: input.detail || base.detail || 'Published resource',
      desc: input.desc || base.desc || 'Published from a Teacher Tools builder.'
    };
  }

  function publish(input) {
    var payload = input || {};
    var userId = getUserId();
    if (!userId) return { ok: false, error: 'signin-required' };

    var tool = String(payload.tool || '').trim();
    if (!tool) return { ok: false, error: 'missing-tool' };

    var html = String(payload.html || '');
    if (!html) return { ok: false, error: 'empty-content' };

    var meta = metaFor(tool, payload);
    var title = String(payload.title || '').trim() || ('Untitled ' + meta.label);
    var signature = hashString(userId + '\n' + tool + '\n' + html);
    var list = publicationList();
    var existing = null;
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (item.creator === userId && item.tool === tool &&
          (item.signature === signature || item.title === title)) {
        existing = item;
        break;
      }
    }

    var now = Date.now();
    var id = existing ? existing.id : makeId();
    var record = {
      id: id,
      title: title,
      tool: tool,
      group: meta.group,
      kind: meta.kind,
      detail: meta.detail,
      desc: meta.desc,
      art: meta.art,
      creator: userId,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      views: existing ? Number(existing.views) || 0 : 0,
      published: true,
      source: String(payload.source || 'builder'),
      signature: signature
    };

    var payloadStored = false;
    try {
      writeRaw(payloadKey(id), html);
      payloadStored = true;
      var nextList = publicationList();
      var replaced = false;
      for (var j = 0; j < nextList.length; j += 1) {
        if (nextList[j].id === id) {
          nextList[j] = record;
          replaced = true;
          break;
        }
      }
      if (!replaced) nextList.unshift(record);
      writePublicationList(nextList);
    } catch (err) {
      if (payloadStored && !existing) removeRaw(payloadKey(id));
      return { ok: false, error: 'storage-full' };
    }

    var result = { ok: true, item: record, duplicate: !!existing };
    dispatch(EVENTS.published, result);
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'teachertools:published', item: record, duplicate: !!existing }, '*'); } catch (err) { /* noop */ }
    }
    return result;
  }

  function listPublications() {
    return publicationList().slice().sort(function (a, b) {
      return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    });
  }

  function listByCreator(creatorId) {
    return listPublications().filter(function (item) { return item.creator === creatorId; });
  }

  function getPublication(id) {
    var list = publicationList();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function getPayload(id) {
    return readRaw(payloadKey(id)) || '';
  }

  function incrementViews(id) {
    var list = publicationList();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        list[i].views = (Number(list[i].views) || 0) + 1;
        try { writePublicationList(list); } catch (err) { /* noop */ }
        return list[i].views;
      }
    }
    return 0;
  }

  function removePublication(id) {
    if (!id) return false;
    var list = publicationList();
    var next = list.filter(function (item) { return item.id !== id; });
    if (next.length === list.length) return false;
    try { writePublicationList(next); } catch (err) { return false; }
    removeRaw(payloadKey(id));
    return true;
  }

  /* ---------------------------------------------------------------- Export */

  window.TeacherTools = {
    storageKeys: KEYS,
    events: EVENTS,
    theme: {
      get: getTheme,
      set: setTheme,
      apply: applyTheme,
      notifyFrame: notifyFrame,
      broadcast: broadcastTheme
    },
    session: {
      getUserId: getUserId,
      isSignedIn: isSignedIn,
      signIn: signIn,
      signOut: signOut
    },
    profiles: {
      get: getProfile,
      all: profileOverrides,
      save: saveProfile
    },
    publishing: {
      toolMeta: TOOL_META,
      publish: publish,
      list: listPublications,
      listByCreator: listByCreator,
      get: getPublication,
      getPayload: getPayload,
      incrementViews: incrementViews,
      remove: removePublication
    }
  };

  /* Apply the persisted theme before first paint. */
  applyTheme(storedTheme(), false);
})(window, document);
