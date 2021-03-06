require('basiccontext/dist/basicContext.min.css');
require('basiccontext/dist/themes/default.min.css');

const UIPlugin = require('@scicad/ui-plugin');
const SvgControls = require('./SvgControls');

const PerspT = require('perspective-transform');
const dat = require('dat.gui');
const yo = require('yo-yo');
const _ = require('lodash');

class Device2UIPlugin extends UIPlugin {
  constructor(elem, focusTracker, port, ...args) {
    super(elem, focusTracker, port, ...args);
    this.corners = [100, 100, 300, 100, 100, 300, 300, 300];
    this.currentcorner = -1;
    this.shiftDown = false;
    this.prevAnchors = [];
    this.scale = 1;
    this.svgControls = CreateScene(this);
    this.gui = CreateGUI(this);
    this.element.appendChild(this.gui.domElement);
  }

  listen() {
    document.addEventListener("wheel", (e) => {
      let container = this.element.querySelector("#container");
      let transform = container.style.transform;
      let scale = parseFloat(transform.split("scale(")[1].split(")")[0]);

      if (e.deltaY > 0) this.scale = scale - 0.01;
      if (e.deltaY < 0) this.scale = scale + 0.01;

      container.style.transform = `scale(${this.scale})`;
    });

    document.addEventListener("keyup", (e) => {
      if (this.hasFocus == true) this.svgControls.moveLocal(e);
    });

    setTimeout(()=> {
      this.initTransform();
      this.element.addEventListener("mousedown", this.mousedown.bind(this));
      this.element.addEventListener("mouseup", this.mouseup.bind(this));
      this.element.addEventListener("mousemove", this.move.bind(this));

      let markers = this.element.querySelectorAll(".corner");

      document.addEventListener("keydown", (e) => {
        if (e.key != "Shift") return;
        this.shiftDown = true;
        _.each(markers, (m) => m.style.background = "green");
      });

      document.addEventListener("keyup", (e) => {
        if (e.key != "Shift") return;
        this.shiftDown = false;
        _.each(markers, (m) => m.style.background = "white");
      });

    }, 1000);

  }

  applyFlipRotateTransforms(elem="video") {
    let node;
    if (elem == "video") node = this.element.querySelector("video");
    let style = node.style;

    let rotate = localStorage.getItem("video-rotation") || 0;
    let scaleX = localStorage.getItem("video-scaleX") || 1;
    let scaleY = localStorage.getItem("video-scaleY") || 1;

    style.transform = `
      rotate(${rotate}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
  }

  rotate(elem="video") {
    let rotate = parseInt(localStorage.getItem("video-rotation")) || 0;
    rotate += 90;
    if (rotate >= 450) rotate = 0;
    localStorage.setItem("video-rotation", rotate);
    this.applyFlipRotateTransforms(elem);
  }

  update() {
    let markers = this.element.querySelectorAll(".corner");
    for (var i = 0; i != 8; i += 2) {
      var marker = document.getElementById(`marker${i}`);
      marker.style.left = this.corners[i] + "px";
      marker.style.top = this.corners[i + 1] + "px";
    }

    if (this.shiftDown) {
      let i = this.currentcorner;
      let inverse = this.prevTransform.transformInverse(this.corners[i], this.corners[i+1]);
      this.prevAnchors[i] = inverse[0];
      this.prevAnchors[i+1] = inverse[1];
      localStorage.setItem("prevAnchors", JSON.stringify(this.prevAnchors));
    } else {
      this.transform2d(...this.corners);
    }
  }

  mousedown(e) {
    let container = this.element.querySelector("#container-outer");
    let bbox = container.getBoundingClientRect();
    let corners = getScaledCoordinates(this.corners, bbox, this.scale);
    let x, y, dx, dy;
    let best = 400;

    x = e.pageX - bbox.left;
    y = e.pageY - bbox.top;

    this.currentcorner = -1;

    for (var i = 0; i != 8; i += 2) {
      dx = x - corners[i];
      dy = y - corners[i + 1];
      if (best > dx*dx + dy*dy) {
        best = dx*dx + dy*dy;
        this.currentcorner = i;
      }
    }
    this.move(e);
  }

  mouseup(e) {
    this.currentcorner = -1;
  }

  move(e) {
    let x, y;
    let container = this.element.querySelector("#container-outer");
    let bbox = container.getBoundingClientRect();
    x = e.pageX - bbox.left;
    y = e.pageY - bbox.top;

    if (this.currentcorner < 0) return;

    let coords = getOriginalCoordinates(x, y, bbox, this.scale);

    this.corners[this.currentcorner] = coords.x;
    this.corners[this.currentcorner + 1] = coords.y;
    localStorage.setItem("corners", JSON.stringify(this.corners));

    this.update();
  }

  transform2d(...points) {
    let box = this.element.querySelector("#box");
    let w = parseFloat(box.style.width), h = parseFloat(box.style.height);
    let transform, t;

    if (this.prevAnchors.length <= 0)
      transform = PerspT([0,0,w,0,0,h,w,h], points);
    if (this.prevAnchors.length > 0)
      transform = PerspT(this.prevAnchors, points);

    t = transform.coeffs;
    t = [t[0], t[3], 0, t[6],
         t[1], t[4], 0, t[7],
         0   , 0   , 1, 0   ,
         t[2], t[5], 0, t[8]];

    this.prevTransform = transform;
    localStorage.setItem("prevTransform", JSON.stringify(this.prevTransform))

    t = "matrix3d(" + t.join(", ") + ")";
    box.style["-webkit-transform"] = t;
    box.style["-moz-transform"] = t;
    box.style["-o-transform"] = t;
    box.style.transform = t;
  }

  initTransform() {
    if (localStorage.getItem("prevAnchors") != null) {
      this.prevAnchors = JSON.parse(localStorage.getItem("prevAnchors"));
    }
    if (localStorage.getItem("corners") != null) {
      this.corners = JSON.parse(localStorage.getItem("corners"));
    }

    let markers = this.element.querySelectorAll(".corner");
    let corners = this.corners;
    this.transform2d(...this.corners);
    for (var i = 0; i != 8; i += 2) {
      var marker = _.find(markers, {id: `marker${i}`});
      marker.style.left = corners[i] + "px";
      marker.style.top  = corners[i + 1] + "px";
    }

    for (var i=0;i != 8; i += 2) {
      let inverse = this.prevTransform.transformInverse(corners[i], corners[i+1]);
      this.prevAnchors[i] = inverse[0];
      this.prevAnchors[i+1] = inverse[1];
    }

    localStorage.setItem("prevAnchors", JSON.stringify(this.prevAnchors));

  }
}

const Styles = {
  video: `
    object-fit: fill;
    transform: rotate(0deg);
  `,
  container: `
    position:relative;
    width: 500px;
    height: 500px;
    overflow: visible;
    user-select: none;
    margin: 0 auto;
    transform: scale(1);
  `,
  box: `
    position: absolute;
    top: 0px;
    left: 0px;
    width: 150px;
    height: 120px;
    transform-origin: 0 0;
    -webkit-transform-origin: 0 0;
    -moz-transform-origin: 0 0;
    -o-transform-origin: 0 0;
    user-select: none;
  `,
  boxImg: `
    width: 150px;
    height: 120px;
    user-select: none;
  `,
  corner: `
    position: absolute;
    top: 0px; left: 0px;
    border: 1px solid blue;
    background: white;
    user-select: none;
    z-index: 20;
  `,
  background: `
    position:relative;
    height:500px;
    width:500px;
    transform: scale(1);
  `
}


const getScaledCoordinates = (origCorners, bbox, scale) => {
  const corners = [];

  for (var i = 0; i != 8; i += 2) {
    const x_tl = origCorners[i];
    const y_tl = origCorners[i+1];
    const x_c = bbox.width/2 - x_tl;
    const y_c = bbox.height/2 - y_tl;

    const x_c_scaled = x_c * scale;
    const y_c_scaled = y_c * scale;


    const x_tl_scaled = bbox.width/2 - x_c_scaled;
    const y_tl_scaled = bbox.height/2 - y_c_scaled;
    corners[i] = x_tl_scaled;
    corners[i+1] = y_tl_scaled;
  }

  return corners;
}

const getOriginalCoordinates = (x, y, bbox, scale) => {

  const x_tl_scaled = x;
  const y_tl_scaled = y;

  const x_c_scaled = bbox.width/2 - x_tl_scaled;
  const y_c_scaled = bbox.height/2 - y_tl_scaled;

  const x_c = x_c_scaled/scale;
  const y_c = y_c_scaled/scale;

  const x_tl = bbox.width/2 - x_c;
  const y_tl = bbox.height/2 - y_c;

  return {x: x_tl, y: y_tl};
}

const CreateGUI = (deviceUIPlugin) => {
  let gui;

  var menu = {
    executeAll() {
      deviceUIPlugin.svgControls.executeAll();
    },
    removeAll() {
      deviceUIPlugin.svgControls.removeAll();
    },
    get hideAnchors() {
      return this._hideAnchors || false;
    },
    set hideAnchors(_hideAnchors) {
      let corners = deviceUIPlugin.element.querySelectorAll(".corner");
      if (_hideAnchors == false) _.each(corners, (c) => c.style.display = "block")
      if (_hideAnchors == true) _.each(corners, (c) => c.style.display = "none")
      this._hideAnchors = _hideAnchors;
    },
    get flipForeground() {
      let placement = localStorage.getItem("placement");
      return placement == "bottom";
    },
    set flipForeground(_flipForeground) {
      if (_flipForeground == true) {
        localStorage.setItem("placement", "bottom");
        deviceUIPlugin.svgControls = CreateScene(deviceUIPlugin);
        deviceUIPlugin.initTransform();
        deviceUIPlugin.element.appendChild(gui.domElement);
      }
      if (_flipForeground == false) {
        localStorage.setItem("placement", "top");
        deviceUIPlugin.svgControls = CreateScene(deviceUIPlugin);
        deviceUIPlugin.initTransform();
        deviceUIPlugin.element.appendChild(gui.domElement);
      }
      this._flipForeground = _flipForeground;
    },
    rotateVideo () {
      deviceUIPlugin.rotate("video");
    },
    get flipVideoX() {
      let x =  localStorage.getItem("video-scaleX");
      return x == -1;
    },
    set flipVideoX(_flipX) {
      if (_flipX == true) {
        localStorage.setItem("video-scaleX", -1);
      } else {
        localStorage.setItem("video-scaleX", 1);
      }
      deviceUIPlugin.applyFlipRotateTransforms("video");
    },
    get flipVideoY() {
      let y =  localStorage.getItem("video-scaleY");
      return y == -1;
    },
    set flipVideoY(_flipY) {
      if (_flipY == true) {
        localStorage.setItem("video-scaleY", -1);
      } else {
        localStorage.setItem("video-scaleY", 1);
      }
      deviceUIPlugin.applyFlipRotateTransforms("video");
    },
    get svgOpacity() {
      let svg = deviceUIPlugin.element.querySelector("svg");
      return svg.style.opacity * 100;
    },
    set svgOpacity(_svgOpacity) {
      let svg = deviceUIPlugin.element.querySelector("svg");
      svg.style.opacity = _svgOpacity / 100.0;
    }
  };

  gui = new dat.GUI({autoPlace: false});
  var sceneFolder = gui.addFolder('Scene');
  var routeFolder = gui.addFolder('Routes');
  var videoFolder = gui.addFolder('Video');
  var svgFolder = gui.addFolder('SVG');

  sceneFolder.add(menu, 'flipForeground');
  sceneFolder.add(menu, 'hideAnchors');
  routeFolder.add(menu, 'removeAll');
  routeFolder.add(menu, 'executeAll');
  videoFolder.add(menu, 'rotateVideo');
  videoFolder.add(menu, 'flipVideoX');
  videoFolder.add(menu, 'flipVideoY');
  svgFolder.add(menu, 'svgOpacity', 0, 100);
  gui.domElement.style.position = "absolute";
  gui.domElement.style.top = "0px";
  gui.domElement.style.display = "inline-table";

  return gui;
}

const CreateScene = (deviceUIPlugin) => {
  let background, foreground, deviceContainer, video;

  let placement = localStorage.getItem("placement") || "top";

  if (placement == 'top') {
    background = deviceContainer = yo`
    <div style="opacity: 0.5;z-index:10;${Styles.background}">
    </div> `;

    foreground = video = yo`
      <video id="video" style="${Styles.video};z-index:5;position:relative;
        width:100%;height:100%;" autoplay>
      </video>
    `;
  } else {
    background = video = yo`
      <video id="video" style="${Styles.background};${Styles.video}" autoplay></video>
    `;

    foreground = deviceContainer = yo`
      <div style="opacity: 0.5;"></div>
    `;
  }


  let container = yo`
    <div id="container-outer" style="${Styles.container}">
      <div id="container" style="${Styles.container}">
          ${background}
          <div id="box" style="${Styles.box}">
            ${foreground}
          </div>
          <div id="marker0" style="${Styles.corner}"class="corner">TL</div>
          <div id="marker2" style="${Styles.corner}"class="corner">TR</div>
          <div id="marker4" style="${Styles.corner}"class="corner">BL</div>
          <div id="marker6" style="${Styles.corner}"class="corner">BR</div>
      </div>
    </div>
  `;

  deviceUIPlugin.element.innerHTML = '';
  deviceUIPlugin.element.appendChild(container);
  deviceUIPlugin.applyFlipRotateTransforms("video");

  deviceUIPlugin.scale = 1;

  if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
        video.src = window.URL.createObjectURL(stream);
        video.play();
    });
  }
  return new SvgControls(deviceContainer);
}


module.exports = Device2UIPlugin;
