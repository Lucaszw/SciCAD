const UIPlugin = require('@scicad/ui-plugin');
const SvgControls = require('./SvgControls');

const PerspT = require('perspective-transform');
const dat = require('dat.gui');
const yo = require('yo-yo');
const _ = require('lodash');

const getScaledCoordinates = (origCorners, bbox) => {
  const corners = [];

  for (var i = 0; i != 8; i += 2) {
    const x_tl = origCorners[i];
    const y_tl = origCorners[i+1];
    const x_c = bbox.width/2 - x_tl;
    const y_c = bbox.height/2 - y_tl;

    const x_c_scaled = x_c * 0.7;
    const y_c_scaled = y_x * 0.7;


    const x_tl_scaled = bbox.width/2 - x_c_scaled;
    const y_tl_scaled = bbox.height/2 - y_c_scaled;
    corners[i] = x_tl_scaled;
    corners[i+1] = y_tl_scaled;
  }

  return corners;
}

const getOriginalCoordinates = (scaledCorners, bbox) => {
  const corners = [];

  for (var i = 0; i != 8; i += 2) {
    const x_tl_scaled = scaledCorners[i];
    const y_tl_scaled = scaledCorners[i+1];

    const x_c_scaled = bbox.width/2 - x_tl_scaled;
    const y_c_scaled = bbox.height/2 - y_tl_scaled;

    const x_c = x_c_scaled/0.7;
    const y_c = y_c_scaled/0.7;

    const x_tl = bbox.width/2 - x_c;
    const y_tl = bbox.height/2 - y_c;

    corners[i] = x_tl;
    corners[i+1] = y_tl;
  }

  return corners;
}


class Device2UIPlugin extends UIPlugin {
  constructor(elem, focusTracker, port, ...args) {
    super(elem, focusTracker, port, ...args);
    this.corners = [100, 100, 300, 100, 100, 300, 300, 300];
    this.currentcorner = -1;
    this.shiftDown = false;
    this.prevAnchors = [];
    this.createScene("top");

    // Construct menu
    let _this = this;
    var menu = {
      get flipForeground() {
        return this._flipForeground || false;
      },
      set flipForeground(_flipForeground) {
        if (_flipForeground == true) {
          _this.createScene('bottom');
          _this.initTransform();
        }
        if (_flipForeground == false) {
          _this.createScene('top');
          _this.initTransform();
        }
        this._flipForeground = _flipForeground;
      }
    };

    var gui = new dat.GUI();
    gui.add(menu, 'flipForeground');
  }

  listen() {
    document.addEventListener("wheel", (e) => {
      let background = this.background;
      let transform = background.style.transform;
      let scale = parseFloat(transform.split("scale(")[1].split(")")[0]);
      if (e.deltaY > 0) {
        background.style.transform = `scale(${scale - 0.01})`;
      }
      if (e.deltaY < 0) {
        background.style.transform = `scale(${scale + 0.01})`;
      }
    });

    document.addEventListener("keyup", (e) => {
      if (this.hasFocus == true) this.svgControls.moveLocal(e);
    });

    // TODO: Replace setTImeout with some page ready event...
    setTimeout(()=> {
      this.initTransform();
      this.element.addEventListener("mousedown", this.mousedown.bind(this));
      this.element.addEventListener("mouseup", this.mouseup.bind(this));
      this.element.addEventListener("mousemove", this.move.bind(this));

      document.addEventListener("keydown", (e) => {
        if (e.key == "Shift") this.shiftDown = true;
      });

      document.addEventListener("keyup", (e) => {
        if (e.key == "Shift") this.shiftDown = false;
      });

    }, 1000);

  }

  update() {
    let box = this.box;
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
    let container = this.element.querySelector("#container");
    let bbox = container.getBoundingClientRect();

    let corners = this.corners;
    // let corners = getScaledCoordinates(this.corners, bbox);

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

    // localStorage.setItem("corners", JSON.stringify(this.corners));
    this.move(e);
  }

  mouseup(e) {
    this.currentcorner = -1;
  }

  move(e) {
    let x, y;
    let container = this.element.querySelector("#container");
    let bbox = container.getBoundingClientRect();
    x = e.pageX - bbox.left;
    y = e.pageY - bbox.top;

    if (this.currentcorner < 0) return;
    this.corners[this.currentcorner] = x;
    this.corners[this.currentcorner + 1] = y;
    localStorage.setItem("corners", JSON.stringify(this.corners));

    this.update();
  }

  transform2d(...points) {
    let w = parseFloat(this.box.style.width), h = parseFloat(this.box.style.height);
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
    this.box.style["-webkit-transform"] = t;
    this.box.style["-moz-transform"] = t;
    this.box.style["-o-transform"] = t;
    this.box.style.transform = t;
  }
  createScene(placement) {
    let background, foreground, deviceContainer, video;
    if (placement == 'top') {
      background = deviceContainer = yo`
      <div style="opacity: 0.5;z-index:10;${Styles.background}">
      </div> `;

      foreground = video = yo`
        <video id="video" style="z-index:5;position:relative;object-fit: fill; width:100%;height:100%;" autoplay></video>
      `;
    } else {
      background = video = yo`
        <video id="video" style="object-fit: fill;${Styles.background}" autoplay></video>
      `;

      foreground = deviceContainer = yo`
        <div style="opacity: 0.5;"></div>
      `;
    }

    this.box = yo`
      <div id="box" style="${Styles.box}">
        ${foreground}
      </div>
    `;

    this.background = background;

    let container = yo`
      <div id="container" style="${Styles.container}">
          ${background}
          ${this.box}
          <div id="marker0" style="${Styles.corner}"class="corner">TL</div>
          <div id="marker2" style="${Styles.corner}"class="corner">TR</div>
          <div id="marker4" style="${Styles.corner}"class="corner">BL</div>
          <div id="marker6" style="${Styles.corner}"class="corner">BR</div>
      </div>
    `;

    this.element.innerHTML = '';
    this.element.appendChild(container);

    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
          video.src = window.URL.createObjectURL(stream);
          video.play();
      });
    }
    this.svgControls = new SvgControls(deviceContainer);

  }

  initTransform() {

    // if (localStorage.getItem("prevTransform") != null) {
    //   this.prevTransform = JSON.parse(localStorage.getItem("prevTransform"));
    // }
    if (localStorage.getItem("prevAnchors") != null) {
      this.prevAnchors = JSON.parse(localStorage.getItem("prevAnchors"));
    }
    if (localStorage.getItem("corners") != null) {
      this.corners = JSON.parse(localStorage.getItem("corners"));
    }

    let box = this.box;
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
  container: `
    position:relative;
    width: 500px;
    height: 500px;
    overflow: visible;
    user-select: none;
    margin: 0 auto;
  `,
  box: `
    position: absolute;
    top: 0px;
    left: 0px;
    width: 150px;
    height: 120px;
    border: 1px solid red;
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

module.exports = Device2UIPlugin;
