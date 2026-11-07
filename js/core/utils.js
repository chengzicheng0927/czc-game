(function (Game) {
  'use strict';
  var serial = 0;
  Game.utils = {
    uid: function (prefix) { serial += 1; return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + serial.toString(36) + '_' + Math.random().toString(36).slice(2, 6); },
    clamp: function (n, a, b) { return Math.min(b, Math.max(a, Number.isFinite(Number(n)) ? Number(n) : a)); },
    shade: function (hex, amount) { var n = parseInt(String(hex).replace('#', ''), 16); if (!Number.isFinite(n)) return '#6B4E5E'; var adjust = function (c) { return Math.round(Math.min(255, Math.max(0, c + amount))); }; return '#' + [adjust((n >> 16) & 255), adjust((n >> 8) & 255), adjust(n & 255)].map(function (c) { return c.toString(16).padStart(2, '0'); }).join(''); },
    dateKey: function (now) { var d = new Date(now === undefined ? Date.now() : now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    escapeHtml: function (str) { return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    utf8Bytes: function (value) {
      var text = String(value), bytes = text.length, groups = text.match(/[^\x00-\x7F]+/g) || [];
      groups.forEach(function (group) { Array.from(group).forEach(function (ch) { var code = ch.codePointAt(0); bytes += (code <= 0x7FF ? 2 : code <= 0xFFFF ? 3 : 4) - ch.length; }); });
      return bytes;
    },
    clone: function (value) { return JSON.parse(JSON.stringify(value)); },
    download: function (filename, text, mime) {
      if (typeof document === 'undefined' || typeof Blob === 'undefined' || !window.URL || !window.URL.createObjectURL) return false;
      var url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000); return true;
    }
  };
})(window.Game);
