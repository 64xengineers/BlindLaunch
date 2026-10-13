/* Blind Run drawings: icons, Hush the mascot, token art, comic panels and the skyline. Original inline SVG strings. */
/* eslint-disable */
const BL = {};


  /* ---------- icons (spec 5.22): 24x24, stroke 2.5, square caps, mitre joins, currentColor ---------- */
  var I = {
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    unlock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.8"/>',
    key: '<circle cx="7.5" cy="16" r="4"/><path d="M10.5 13 19.5 4M15.5 8l3 3M13 10.5l2 2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2.5"/>',
    "eye-off": '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 3.5l16 17"/>',
    equals: '<path d="M5 9h14M5 15h14"/>',
    "arrow-up-right": '<path d="M6.5 17.5 17 7M8.5 6.5H17.5V15.5"/>',
    shield: '<path d="M12 2.8 4.5 5.8v6c0 4.8 3.2 8 7.5 9.4 4.3-1.4 7.5-4.6 7.5-9.4v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3.5 2.5 20.5h19z"/><path d="M12 10v4.5M12 17v.6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10.5v6.5M12 7v.6"/>',
    external: '<path d="M13.5 4H20v6.5M20 4l-9 9M18 13.5V20H4V6h6.5"/>',
    "chevron-right": '<path d="M9 5l7 7-7 7"/>',
    "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
    "chevron-down": '<path d="M5 9l7 7 7-7"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M4 12h16"/>',
    flag: '<path d="M5 21.5V3.5M5 4.5h13l-2.5 4.5 2.5 4.5H5"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/>',
    wallet: '<path d="M3.5 7.5h17v12.5h-17zM3.5 7.5l12.5-4v4"/><path d="M15 13.8h2.5"/>',
    fingerprint: '<path d="M5.5 9.5a7 7 0 0 1 13 0M7.5 19c1-2 1.5-4.2 1.5-6.5a3 3 0 0 1 6 0c0 3-.4 5.4-1.3 7.5M12 12.5c0 3.2-.7 6-2 8.3M18.6 13.5c0 2.4-.3 4.6-1 6.6M5 13.5c0 1.7-.3 3.2-.9 4.5"/>',
    coin: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 3.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM10.8 8.5h2.4v7h-2.4z"/>',
    dollar: '<path d="M12 2.5v19M16.5 7.2c-.9-1.3-2.5-2-4.5-2-2.6 0-4.2 1.3-4.2 3.2 0 4.6 9.2 2.4 9.2 7 0 2-1.8 3.4-4.8 3.4-2.2 0-4-.8-5-2.2"/>',
    return: '<path d="M9 14.5 4 9.5l5-5"/><path d="M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    bag: '<path fill="currentColor" stroke="none" d="M8 2.5h8l-2.2 4h-3.6zM12 8c4.4 0 7.5 5 7.5 9.5 0 2.4-1.6 4-4 4h-7c-2.4 0-4-1.6-4-4C4.5 13 7.6 8 12 8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    speaker: '<path d="M3.5 9h4l5-4v14l-5-4h-4z"/><path d="M16 9c1.4 1.6 1.4 4.4 0 6M18.6 6.4c2.9 3.1 2.9 8.1 0 11.2"/>',
    "speaker-off": '<path d="M3.5 9h4l5-4v14l-5-4h-4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    wave: '<path d="M2 12c2.2-5 4.3-5 6.5 0s4.3 5 6.5 0 4.3-5 7 0"/>',
    "flat-line": '<path d="M2.5 12h19"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12"/><path d="M15.5 8.5v-5h-12v12h5"/>',
    sparkle: '<path d="M12 2.5c.9 5.4 2.9 7.6 9 9.5-6.1 1.9-8.1 4.1-9 9.5-.9-5.4-2.9-7.6-9-9.5 6.1-1.9 8.1-4.1 9-9.5z"/>',
    star: '<path d="M12 3l2.7 5.7 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z"/>',
    half: '<circle cx="12" cy="12" r="8.5"/><path fill="currentColor" stroke="none" d="M12 3.5a8.5 8.5 0 0 1 0 17z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  BL.icon = function (name, size, cls) {
    var s = size || 24;
    return '<svg class="ic' + (cls ? " " + cls : "") + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">' + (I[name] || "") + "</svg>";
  };

  /* ---------- Hush (spec 4) ---------- */
  var INK = 'stroke="#000" stroke-width="4" stroke-linejoin="round"';
  var C = { cyan: "#00F0FF", yellow: "#FCEE0A", magenta: "#FF2A6D", shade: "#C2185B", steel: "#D8DCF0", paper: "#F6F1E1", panel: "#2A1D5E", coral: "#FF6154", green: "#05FFA1", violet: "#B48CFF" };

  function star4(cx, cy, r, fill) {
    var k = r * 0.32;
    return '<path d="M' + cx + " " + (cy - r) + " Q" + (cx + k) + " " + (cy - k) + " " + (cx + r) + " " + cy + " Q" + (cx + k) + " " + (cy + k) + " " + cx + " " + (cy + r) + " Q" + (cx - k) + " " + (cy + k) + " " + (cx - r) + " " + cy + " Q" + (cx - k) + " " + (cy - k) + " " + cx + " " + (cy - r) + 'Z" fill="' + fill + '" stroke="#000" stroke-width="1.5"/>';
  }

  var EYES = {
    idle: '<rect x="42" y="77" width="8" height="12" rx="4" fill="' + C.cyan + '"/><rect x="70" y="77" width="8" height="12" rx="4" fill="' + C.cyan + '"/>',
    look: '<rect x="39" y="80" width="8" height="12" rx="4" fill="' + C.cyan + '"/><rect x="67" y="80" width="8" height="12" rx="4" fill="' + C.cyan + '"/>',
    excited: '<path d="M40 86 l6 -6 l6 6 M68 86 l6 -6 l6 6" fill="none" stroke="' + C.cyan + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    squeeze: '<path d="M41 78 l9 5 l-9 5 M79 78 l-9 5 l9 5" fill="none" stroke="' + C.cyan + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    waiting: '<rect x="46" y="74" width="8" height="12" rx="4" fill="' + C.cyan + '"/><rect x="74" y="74" width="8" height="12" rx="4" fill="' + C.cyan + '"/>',
    win: star4(46, 83, 7, C.yellow) + star4(74, 83, 7, C.yellow),
    fair: '<path d="M40 85 q6 -6 12 0" fill="none" stroke="' + C.cyan + '" stroke-width="4" stroke-linecap="round"/><rect x="70" y="77" width="8" height="12" rx="4" fill="' + C.cyan + '"/>',
    missed: '<rect x="41" y="84.5" width="10" height="3" rx="1.5" fill="' + C.cyan + '"/><rect x="69" y="84.5" width="10" height="3" rx="1.5" fill="' + C.cyan + '"/>',
    happy: '<path d="M40 86 q6 -6 12 0 M68 86 q6 -6 12 0" fill="none" stroke="' + C.cyan + '" stroke-width="4" stroke-linecap="round"/>',
    error: '<path d="M42.5 79.5l7 7M49.5 79.5l-7 7M70.5 79.5l7 7M77.5 79.5l-7 7" stroke="' + C.coral + '" stroke-width="3.5" stroke-linecap="round"/>',
  };
  var MOUTH = {
    keyhole: '<circle cx="60" cy="105" r="5" fill="#000"/><path d="M57 108 L63 108 L64 116 L56 116 Z" fill="#000"/>',
    grin: '<path d="M48 102 H72 Q72 116 60 116 Q48 116 48 102Z" fill="#000"/><path d="M53 110 Q60 114 67 110" fill="none" stroke="' + C.magenta + '" stroke-width="2.5" stroke-linecap="round"/>',
    flat: '<path d="M52 108 H68" stroke="#000" stroke-width="4" stroke-linecap="round"/>',
    o: '<circle cx="60" cy="107" r="3.5" fill="#000"/>',
    smile: '<path d="M50 104 Q60 114 70 104" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>',
    wobble: '<path d="M52 110 q4 -3 8 0 q4 3 8 0" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>',
  };
  function hand(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + C.paper + '" stroke="#000" stroke-width="3"/>'; }
  function arm(d) { return '<path d="' + d + '" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>'; }
  var ARMS = {
    relaxed: arm("M18 92 q-12 6 -14 18") + arm("M102 92 q12 6 14 18") + hand(4, 110) + hand(116, 110),
    up: arm("M18 88 q-10 -12 -6 -26") + arm("M102 88 q10 -12 6 -26") + hand(12, 62) + hand(108, 62),
    wrap: arm("M18 92 q20 14 40 10") + arm("M102 92 q-20 14 -40 10") + hand(56, 102) + hand(64, 102),
    hip: arm("M18 92 q-12 6 -14 18") + arm("M102 90 l13 9 l-11 9") + hand(4, 110) + hand(104, 108),
    thumb: arm("M18 92 q-12 6 -14 18") + arm("M102 92 q14 -2 12 -18") + hand(4, 110) + '<rect x="109" y="62" width="9" height="14" rx="4" fill="' + C.paper + '" stroke="#000" stroke-width="3"/><rect x="111" y="54" width="5" height="10" rx="2.5" fill="' + C.paper + '" stroke="#000" stroke-width="3"/>',
    shrug: arm("M18 94 q-10 2 -13 -10") + arm("M102 94 q10 2 13 -10") + hand(5, 82) + hand(115, 82),
    hug: arm("M18 92 q10 20 30 22") + arm("M102 92 q-10 20 -30 22"),
  };
  function bag(x, y, s) {
    return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')"><path d="M-6 -14 h12 l-3 5 h-6z" fill="' + C.green + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M0 -10 c9 0 15 8 15 16 c0 5 -3 8 -8 8 h-14 c-5 0 -8 -3 -8 -8 c0 -8 6 -16 15 -16z" fill="' + C.green + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M3 -2.5 c-1 -1.4 -5.5 -1.6 -5.5 1 c0 3 6 1.5 6 4.6 c0 2.6 -4.6 2.5 -6 1 M0 -5 v14" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></g>';
  }
  var EXTRA = {
    bang: '<g class="h-bang" transform="translate(104 20) rotate(10)"><rect x="-8" y="-13" width="16" height="26" rx="2" fill="' + C.yellow + '" stroke="#000" stroke-width="3"/><path d="M0 -8 V3" stroke="#000" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="8.5" r="2.4" fill="#000"/></g>',
    dots: '<g class="h-dots" transform="translate(104 24)"><path d="M-15 -11 h30 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-18 l-8 7 l1 -7 h-5 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4z" fill="' + C.paper + '" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><circle class="d1" cx="-7" cy="-1" r="2.6"/><circle class="d2" cx="0" cy="-1" r="2.6"/><circle class="d3" cx="7" cy="-1" r="2.6"/></g>',
    drop: '<path class="h-drop" d="M98 50 q6 8 0 12 q-6 -4 0 -12z" fill="' + C.cyan + '" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>',
    crack: '<path d="M70 72 l4 6 l-3 4 l5 6" fill="none" stroke="' + C.paper + '" stroke-width="2.5" stroke-linejoin="miter"/>',
    spark: '<g transform="translate(92 14)"><path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3Z" fill="' + C.coral + '" stroke="#000" stroke-width="2"/></g>',
    coin: '<g class="h-coin"><circle cx="110" cy="44" r="12" fill="var(--coin, ' + C.yellow + ')" stroke="#000" stroke-width="3"/><circle cx="110" cy="44" r="6" fill="none" stroke="#000" stroke-width="2"/></g>',
    bagFeet: '<g class="h-bag">' + bag(104, 128, 0.62) + "</g>",
    bagHug: '<g class="h-bag">' + bag(60, 110, 0.95) + "</g>",
  };
  var POSES = {
    idle: { eyes: "idle", mouth: "keyhole", arms: "relaxed" },
    excited: { eyes: "excited", mouth: "grin", arms: "up", extra: ["bang"] },
    locking: { eyes: "idle", mouth: "flat", arms: "wrap", open: true },
    waiting: { eyes: "waiting", mouth: "o", arms: "hip", extra: ["dots"] },
    win: { eyes: "win", mouth: "grin", arms: "up", open: true, extra: ["coin"] },
    fair: { eyes: "fair", mouth: "smile", arms: "thumb", extra: ["drop"] },
    missed: { eyes: "missed", mouth: "wobble", arms: "shrug", extra: ["bagFeet"] },
    refund: { eyes: "happy", mouth: "smile", arms: "hug", extra: ["bagHug"] },
    error: { eyes: "error", mouth: "wobble", arms: "relaxed", askew: true, extra: ["crack", "spark"] },
  };
  BL.hushEyes = EYES;

  var SHACKLE = '<g class="h-shackle"><path d="M38 58 V38 a22 22 0 0 1 44 0 V58" fill="none" stroke="#000" stroke-width="16" stroke-linecap="butt"/><path d="M38 58 V38 a22 22 0 0 1 44 0 V58" fill="none" stroke="' + C.steel + '" stroke-width="9" stroke-linecap="butt"/></g>';
  var BODY = '<rect class="h-bodyfill" x="18" y="52" width="84" height="70" rx="18" fill="' + C.magenta + '"/><rect x="80" y="56" width="18" height="62" rx="10" fill="' + C.shade + '" clip-path="url(#bl-hush-clip)"/><rect x="18" y="52" width="84" height="70" rx="18" fill="none" ' + INK + "/>";
  var SHINE = '<rect x="28" y="60" width="10" height="18" rx="5" fill="#fff" fill-opacity=".55"/>';
  var VISOR = '<rect x="28" y="70" width="64" height="26" rx="13" fill="#000"/><rect x="28" y="70" width="64" height="26" rx="13" fill="url(#bl-scan-light)" opacity=".25"/>';

  /* parts only (for nesting inside other drawings) */
  BL.hushParts = function (pose, opts) {
    var p = POSES[pose] || POSES.idle;
    opts = opts || {};
    var eyes = opts.eyes || p.eyes;
    var extras = (p.extra || []).map(function (k) { return EXTRA[k]; }).join("");
    if (opts.head) {
      return '<g class="h-up">' + SHACKLE + BODY + VISOR + '<g class="h-eyes">' + EYES[eyes] + "</g></g>";
    }
    return (
      '<g class="h-legs"><rect x="34" y="118" width="16" height="16" rx="5" fill="' + C.panel + '" stroke="#000" stroke-width="3"/><rect x="70" y="118" width="16" height="16" rx="5" fill="' + C.panel + '" stroke="#000" stroke-width="3"/></g>' +
      '<rect class="h-foot-l" x="30" y="129.5" width="24" height="9" rx="4.5" fill="' + C.cyan + '" stroke="#000" stroke-width="3"/>' +
      '<rect class="h-foot-r" x="66" y="129.5" width="24" height="9" rx="4.5" fill="' + C.cyan + '" stroke="#000" stroke-width="3"/>' +
      '<g class="h-up">' + SHACKLE + BODY + SHINE + VISOR +
      '<g class="h-eyes">' + EYES[eyes] + "</g>" +
      '<g class="h-mouth">' + MOUTH[p.mouth] + "</g>" +
      '<g class="h-arms">' + ARMS[p.arms] + "</g>" + extras + "</g>"
    );
  };

  /* Hush as a standalone svg. size = rendered height in px. */
  BL.hush = function (pose, size, opts) {
    opts = opts || {};
    var p = POSES[pose] || POSES.idle;
    var head = !!opts.head;
    var vb = head ? "12 -8 96 134" : "-4 -6 128 148";
    var w = head ? Math.round(size * 96 / 134) : Math.round(size * 128 / 148);
    var open = opts.open != null ? opts.open : p.open;
    var cls = "hush hush--" + pose + (open ? " is-open" : "") + (p.askew ? " is-askew" : "") + (opts.cls ? " " + opts.cls : "") + (opts.still ? " is-still" : "");
    return '<svg class="' + cls + '" viewBox="' + vb + '" width="' + w + '" height="' + size + '" aria-hidden="true" focusable="false"' + (opts.coin ? ' style="--coin:' + opts.coin + '"' : "") + ">" + BL.hushParts(pose, opts) + "</svg>";
  };

  /* ---------- token art (spec 9) ---------- */
  var FACE = {
    ncat:
      '<path d="M27 44 L29 15 L47 31Z M73 44 L71 15 L53 31Z" fill="#000"/><circle cx="50" cy="55" r="25" fill="#000"/>' +
      '<path d="M33 22 L44 32 L34 37Z M67 22 L56 32 L66 37Z" fill="' + C.shade + '"/>' +
      '<ellipse cx="40" cy="52" rx="6" ry="7.5" fill="' + C.yellow + '"/><ellipse cx="60" cy="52" rx="6" ry="7.5" fill="' + C.yellow + '"/><rect x="38.8" y="45.5" width="2.4" height="13" rx="1.2" fill="#000"/><rect x="58.8" y="45.5" width="2.4" height="13" rx="1.2" fill="#000"/>' +
      '<path d="M46 62 h8 l-4 4z" fill="' + C.magenta + '"/>' +
      '<path d="M31 62 L11 58 M31 66 L10 66 M31 70 L11 75 M69 62 L89 58 M69 66 L90 66 M69 70 L89 75" stroke="' + C.cyan + '" stroke-width="3" stroke-linecap="round"/>',
    snail:
      '<path d="M14 80 C14 70 20 66 28 66 L80 66 C88 66 90 74 88 80Z" fill="' + C.green + '" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M24 67 L18 44 M30 66 L30 42" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><circle cx="18" cy="42" r="4.5" fill="' + C.green + '" stroke="#000" stroke-width="3"/><circle cx="30" cy="40" r="4.5" fill="' + C.green + '" stroke="#000" stroke-width="3"/>' +
      '<circle cx="60" cy="48" r="24" fill="' + C.yellow + '" stroke="#000" stroke-width="3.5"/>' +
      '<path d="M63 30 L50 50 H60 L55 66 L71 43 H61 Z" fill="#000"/>' +
      '<path d="M86 74 h8 M84 69 h7" stroke="#000" stroke-width="3" stroke-linecap="round"/>',
    ramen:
      '<path d="M38 36 L24 6 M62 36 L76 6" stroke="#000" stroke-width="8" stroke-linecap="round"/><path d="M38 36 L24 6 M62 36 L76 6" stroke="' + C.paper + '" stroke-width="3.5" stroke-linecap="round"/>' +
      '<path d="M50 30 C70 30 80 46 78 60 C76 74 64 82 50 82 C36 82 24 74 22 60 C20 46 30 30 50 30Z" fill="#C2B8E8" stroke="#000" stroke-width="3.5"/>' +
      '<circle cx="40" cy="52" r="4.2" fill="#000"/><circle cx="60" cy="52" r="4.2" fill="#000"/><circle cx="41.3" cy="50.7" r="1.3" fill="#fff"/><circle cx="61.3" cy="50.7" r="1.3" fill="#fff"/>' +
      '<ellipse cx="50" cy="64" rx="6" ry="4.5" fill="' + C.magenta + '" stroke="#000" stroke-width="2.5"/>' +
      '<path d="M36 66 q-6 -4 -12 0 t-12 0 M36 71 q-6 -4 -12 0 t-12 0 M64 66 q6 -4 12 0 t12 0 M64 71 q6 -4 12 0 t12 0" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M36 66 q-6 -4 -12 0 t-12 0 M36 71 q-6 -4 -12 0 t-12 0 M64 66 q6 -4 12 0 t12 0 M64 71 q6 -4 12 0 t12 0" fill="none" stroke="' + C.paper + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M46 74 h8 v5 h-8z" fill="' + C.paper + '" stroke="#000" stroke-width="2"/>',
    moth:
      '<path d="M48 44 C30 18 10 22 12 40 C14 52 30 54 47 50Z M52 44 C70 18 90 22 88 40 C86 52 70 54 53 50Z" fill="' + C.violet + '" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M47 54 C32 58 20 70 28 80 C34 86 44 74 48 62Z M53 54 C68 58 80 70 72 80 C66 86 56 74 52 62Z" fill="' + C.violet + '" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<circle cx="24" cy="38" r="5" fill="none" stroke="#000" stroke-width="2.5"/><circle cx="76" cy="38" r="5" fill="none" stroke="#000" stroke-width="2.5"/>' +
      '<ellipse cx="50" cy="56" rx="7" ry="22" fill="#000"/>' +
      '<path d="M46 30 Q40 16 34 14 M54 30 Q60 16 66 14" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="45" cy="40" r="5.5" fill="' + C.yellow + '" stroke="#000" stroke-width="2.5"/><circle cx="55" cy="40" r="5.5" fill="' + C.yellow + '" stroke="#000" stroke-width="2.5"/>' +
      '<path d="M40 40 L30 44 M60 40 L70 44" stroke="' + C.yellow + '" stroke-width="2" stroke-linecap="round" opacity=".9"/>',
    frog:
      '<circle cx="32" cy="36" r="12" fill="' + C.green + '" stroke="#000" stroke-width="3.5"/><circle cx="68" cy="36" r="12" fill="' + C.green + '" stroke="#000" stroke-width="3.5"/>' +
      '<path d="M12 60 C12 42 30 36 50 36 C70 36 88 42 88 60 C88 76 72 84 50 84 C28 84 12 76 12 60Z" fill="' + C.green + '" stroke="#000" stroke-width="3.5"/>' +
      '<rect x="16" y="30" width="68" height="14" rx="4" fill="' + C.steel + '" stroke="#000" stroke-width="3.5"/><rect x="22" y="34" width="56" height="6" rx="2" fill="#000"/><rect x="26" y="35.5" width="10" height="3" rx="1.5" fill="' + C.cyan + '"/><rect x="64" y="35.5" width="10" height="3" rx="1.5" fill="' + C.cyan + '"/>' +
      '<path d="M26 64 Q50 76 74 64" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><circle cx="42" cy="54" r="1.8" fill="#000"/><circle cx="58" cy="54" r="1.8" fill="#000"/>',
    goblin:
      '<path d="M28 46 L4 30 L22 60Z M72 46 L96 30 L78 60Z" fill="' + C.green + '" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M50 24 C68 24 78 38 78 54 C78 72 66 84 50 84 C34 84 22 72 22 54 C22 38 32 24 50 24Z" fill="' + C.green + '" stroke="#000" stroke-width="3.5"/>' +
      '<path d="M32 46 L44 50 M68 46 L56 50" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>' +
      '<ellipse cx="39" cy="56" rx="6" ry="5.5" fill="' + C.magenta + '" stroke="#000" stroke-width="2.5"/><ellipse cx="61" cy="56" rx="6" ry="5.5" fill="' + C.magenta + '" stroke="#000" stroke-width="2.5"/><circle cx="39" cy="56" r="2" fill="#000"/><circle cx="61" cy="56" r="2" fill="#000"/>' +
      '<path d="M36 70 Q50 78 64 70" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><path d="M53 72.5 L54 81 L59 71Z" fill="' + C.paper + '" stroke="#000" stroke-width="2.2" stroke-linejoin="round"/>',
    coo:
      '<path d="M50 20 C70 20 82 36 82 54 C82 70 70 80 54 80 L40 80 C28 80 20 72 20 60 C20 36 32 20 50 20Z" fill="#C2B8E8" stroke="#000" stroke-width="3.5"/>' +
      '<path d="M24 66 C30 76 42 80 56 78 C48 74 42 70 40 62Z" fill="' + C.violet + '" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M78 44 L96 50 L78 56Z" fill="' + C.yellow + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="62" cy="42" r="8" fill="' + C.cyan + '" stroke="#000" stroke-width="3"/><circle cx="64" cy="42" r="3.4" fill="#000"/>' +
      '<path d="M40 16 L44 24 M50 12 L50 21 M60 16 L56 24" stroke="#000" stroke-width="3" stroke-linecap="round"/>',
  };
  var BADGE = { ncat: C.magenta, snail: C.violet, ramen: C.yellow, moth: C.cyan, frog: C.green, goblin: C.coral, coo: C.paper };
  BL.badgeColor = BADGE;

  BL.art = function (id, size, cls) {
    var s = size || 56;
    var sw = Math.min(6, 300 / s), h = sw / 2;
    var cut = s >= 100 ? (14 * 100) / s : (8 * 100) / s;
    var shape = "M" + h + " " + h + "H" + (100 - h) + "V" + (100 - cut) + "L" + (100 - cut) + " " + (100 - h) + "H" + h + "Z";
    return '<svg class="art' + (cls ? " " + cls : "") + '" viewBox="0 0 100 100" width="' + s + '" height="' + s + '" aria-hidden="true" focusable="false">' +
      '<path d="' + shape + '" fill="' + (BADGE[id] || C.paper) + '"/>' +
      '<path d="' + shape + '" fill="url(#bl-scan)" opacity=".15"/>' +
      (FACE[id] || "") +
      '<path d="' + shape + '" fill="none" stroke="#000" stroke-width="' + sw + '"/></svg>';
  };

  /* ---------- comic drawings (spec 8.1) ---------- */
  function slip(x, y, w, h, rot) {
    var teeth = "", n = Math.round(w / 8), tw = w / n;
    for (var i = n - 1; i >= 0; i--) teeth += " L" + (x + tw * i + tw / 2) + " " + (y + h + 5) + " L" + (x + tw * i) + " " + (y + h);
    return '<g transform="rotate(' + (rot || 0) + " " + (x + w / 2) + " " + (y + h / 2) + ')"><path d="M' + x + " " + y + " H" + (x + w) + " V" + (y + h) + teeth + 'Z" fill="' + C.paper + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M' + (x + 7) + " " + (y + 9) + " h" + (w * 0.55) + " M" + (x + 7) + " " + (y + 17) + " h" + (w * 0.7) + " M" + (x + 7) + " " + (y + 25) + " h" + (w * 0.4) + '" stroke="#000" stroke-width="3" stroke-linecap="round"/></g>';
  }
  function miniLock(x, y, open, fill, rot) {
    var sh = open ? '<path d="M-5 -2 V-8 a5 5 0 0 1 10 0" transform="translate(0 -5) rotate(-18 5 -2)" fill="none" stroke="#000" stroke-width="3"/>' : '<path d="M-5 -2 V-8 a5 5 0 0 1 10 0 V-2" fill="none" stroke="#000" stroke-width="3"/>';
    return '<g transform="translate(' + x + " " + y + ") rotate(" + (rot || 0) + ')">' + sh + '<rect x="-9" y="-3" width="18" height="15" rx="3" fill="' + fill + '" stroke="#000" stroke-width="3"/><circle cx="0" cy="4" r="2" fill="#000"/></g>';
  }
  function blob(x, y, fill, tag, flip) {
    return '<g transform="translate(' + x + " " + y + ')"><path d="M-17 30 C-20 8 -14 -10 0 -10 C14 -10 20 8 17 30Z" fill="' + fill + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="-5" cy="2" r="2.6" fill="#000"/><circle cx="5" cy="2" r="2.6" fill="#000"/><path d="M-4 10 q4 4 8 0" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>' +
      (tag ? '<path d="M' + (flip ? "-12" : "12") + ' 16 l' + (flip ? "-8" : "8") + ' -8" stroke="#000" stroke-width="3" stroke-linecap="round"/><g transform="translate(' + (flip ? -42 : 14) + ' -18) rotate(' + (flip ? -6 : 6) + ')"><path d="M0 0 h28 l6 7 l-6 7 h-28z" fill="' + C.paper + '" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><text x="14" y="10.6" text-anchor="middle" font-family="Oxanium, ui-monospace, monospace" font-weight="800" font-size="9.5" fill="#000">' + tag + "</text></g>" : "") + "</g>";
  }
  function coin(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.yellow + '" stroke="#000" stroke-width="2.5"/><path d="M' + x + " " + (y - r * 0.45) + " v" + r * 0.9 + '" stroke="#000" stroke-width="2"/>'; }

  var COMIC = {
    1: '<g transform="translate(0 6)">' + slip(64, 82, 56, 36, -6) +
      '<svg x="44" y="0" width="80" height="94" viewBox="-4 -6 128 148">' + BL.hushParts("locking", { eyes: "squeeze" }) + "</svg>" +
      '<path d="M48 8 l-8 -6 M60 4 l-2 -9 M120 10 l9 -5 M126 24 l10 0" stroke="#000" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M18 58 l14 -4 l-4 10 l14 -4" fill="none" stroke="' + C.magenta + '" stroke-width="3.5" stroke-linejoin="miter"/></g>',
    2: '<circle cx="80" cy="66" r="30" fill="' + C.paper + '" stroke="#000" stroke-width="3.5"/><circle cx="80" cy="66" r="24" fill="none" stroke="#000" stroke-width="1.5" stroke-dasharray="2 5.5"/><path d="M80 66 V48 M80 66 h9" stroke="#000" stroke-width="3.5" stroke-linecap="square"/>' +
      '<text x="80" y="88" text-anchor="middle" font-family="Oxanium, ui-monospace, monospace" font-weight="800" font-size="11" fill="#000">0:00</text>' +
      miniLock(34, 34, true, C.cyan, -10) + miniLock(126, 34, true, C.yellow, 10) + miniLock(24, 92, true, C.green, -6) + miniLock(136, 92, true, C.violet, 8) + miniLock(80, 14, true, C.magenta, 0) +
      '<path d="M46 26 l6 -6 M114 26 l-6 -6 M38 82 l8 -2 M122 82 l-8 -2 M70 4 l-4 -4 M90 4 l4 -4" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>',
    3: blob(36, 66, C.cyan, "$0.016", true) + blob(84, 60, C.violet, "$0.016") + blob(132, 70, C.green, "$0.016") +
      '<path d="M8 112 H152" stroke="#000" stroke-width="3" stroke-linecap="round"/>',
    4: '<g transform="translate(6 34)"><rect x="0" y="22" width="56" height="48" fill="' + C.green + '" stroke="#000" stroke-width="3"/><path d="M-4 22 L4 2 H52 L60 22Z" fill="' + C.paper + '" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M14 2 L10 22 M28 2 V22 M42 2 L46 22" stroke="#000" stroke-width="2.5"/><path d="M-4 22 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0" fill="' + C.green + '" stroke="#000" stroke-width="3"/><path d="M12 48 l10 -10 l8 6 l12 -14" fill="none" stroke="#000" stroke-width="3"/></g>' +
      '<path d="M54 46 Q90 0 118 52" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="4 5"/>' + coin(74, 22, 7) + coin(98, 20, 7) + coin(114, 40, 6) +
      blob(118, 80, C.cyan, "") + blob(148, 86, C.violet, ""),
  };
  BL.comic = function (n, label) {
    return '<svg class="comic-art" viewBox="0 0 160 120" role="img" aria-label="' + label + '">' + COMIC[n] + "</svg>";
  };

  /* ---------- skyline (spec 3) ---------- */
  BL.skyline = function () {
    var b = [[0, 70, 46], [44, 40, 34], [76, 96, 30], [104, 56, 52], [154, 120, 26], [178, 80, 44], [220, 50, 36], [254, 104, 30], [282, 66, 58], [338, 130, 22], [358, 86, 40], [396, 46, 50], [444, 112, 28], [470, 72, 44], [512, 92, 34], [544, 58, 60], [602, 124, 24], [624, 78, 46], [668, 44, 40], [706, 100, 34], [738, 62, 54], [790, 140, 24], [812, 84, 48], [858, 54, 38], [894, 110, 30], [922, 70, 56], [976, 96, 28], [1002, 50, 44], [1044, 118, 26], [1068, 76, 50], [1116, 60, 40], [1154, 102, 30], [1182, 66, 58]];
    var bld = "", win = "";
    var seed = 3;
    function r() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    b.forEach(function (q) {
      var x = q[0], hgt = q[1], w = q[2];
      bld += '<rect x="' + x + '" y="' + (180 - hgt) + '" width="' + w + '" height="' + hgt + '"/>';
      if (hgt > 100) bld += '<rect x="' + (x + w / 2 - 1) + '" y="' + (180 - hgt - 14) + '" width="2" height="14"/>';
      for (var k = 0; k < 3; k++) {
        if (r() < 0.55) {
          var wx = x + 4 + Math.floor(r() * (w - 10)), wy = 180 - hgt + 8 + Math.floor(r() * (hgt - 20));
          win += '<rect x="' + wx + '" y="' + wy + '" width="3" height="4" fill="' + (r() < 0.5 ? C.yellow : C.cyan) + '"/>';
        }
      }
    });
    return '<svg class="skyline-svg" viewBox="0 0 1240 180" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><g fill="#0D0920">' + bld + '</g><g opacity=".6">' + win + "</g></svg>";
  };

export const icon = BL.icon;
export const hush = BL.hush;
export const hushParts = BL.hushParts;
export const art = BL.art;
export const comic = BL.comic;
export const skyline = BL.skyline;
export const badgeColor = BL.badgeColor;
