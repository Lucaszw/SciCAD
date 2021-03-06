const $ = require('jquery');
const _ = require('lodash');
const _fp = require('lodash/fp');
const Key = require('keyboard-shortcut');
const THREE = require('three');

const THREEx = {}
require('threex-domevents')(THREE, THREEx);

const ThreeHelpers = require('three-helpers.svg-paths-group')(THREE);
const PlaneTransform = require('three.planetransform/src/three.planetransform.js')(THREE);

const ANCHOR_KEY = 'scicad:device-controller:anchors';

function GetBoundingBox(object) {
  const bbox = new THREE.Box3().setFromObject(object);
  const width  = bbox.max.x - bbox.min.x;
  const height = bbox.max.y - bbox.min.y;

  const origin = new THREE.Vector3();
  origin.setFromMatrixPosition( object.matrixWorld );

  const left = origin.x;
  const right = origin.x + width;
  const bottom = origin.y;
  const top = origin.y + height;

  return {left, right, bottom, top, width, height};
}

function GetSize(object) {
  const bbox = GetBoundingBox(object);
  return [bbox.width, bbox.height];
}

class VideoControls {
  constructor(scene, camera, renderer, updateFcts, svgGroup) {
    const [width, height] = GetSize(svgGroup);

    const bbox = GetBoundingBox(svgGroup);
    this.anchors = new Anchors(bbox);
    // scene.add(this.anchors.group);

    var plane = new PlaneTransform(scene, camera, renderer, {width, height});
    this.plane = plane;

    this.updateFcts = updateFcts;
    updateFcts.push(function(delta, now){
      plane.update(delta, now);
    });

    this.planeReady().then((d)=> {
      if (d.status != "failed")
        plane.mesh.position.z = -0.5; // Ensure video plane is behind device
    });

    this.svgGroup = svgGroup;
    this.scene = scene;
    // this.anchors = null;
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.camera = camera;
    this.numRotations = 0;
    if (localStorage.getItem(ANCHOR_KEY)) {
      var {diagonalRatioArray, positionArray} = JSON.parse(localStorage.getItem(ANCHOR_KEY));
      if (diagonalRatioArray) {
        this.plane.applyPrevGeometry(diagonalRatioArray, positionArray);
      }
    }
  }

  getPoints() {
    /*Get points and diagonalRatios for flip and rotate operations*/

    const bbox = GetBoundingBox(this.svgGroup);
    var anchors = new Anchors(bbox);
    var {transform, diagonalRatioArray, positionArray} =
      this.plane.set_anchors(anchors.positions);

    let p1,p2,p3,p4;
    p1 = positionArray.slice(0,3);
    p2 = positionArray.slice(3,6);
    p3 = positionArray.slice(6,9);
    p4 = positionArray.slice(9,12);

    let [d1,d2,d3,d4] = diagonalRatioArray;
    return {p1,p2,p3,p4,d1,d2,d3,d4}
  }

  rotate() {
    var {p1,p2,p3,p4,d1,d2,d3,d4} = this.getPoints();
    this.plane.applyPrevGeometry([d3,d1,d4,d2], [...p3,...p1,...p4,...p2]);
    this.numRotations += 1;
    this.saveAnchors();
  }

  flipHorizontal() {
    var {p1,p2,p3,p4,d1,d2,d3,d4} = this.getPoints();
    this.plane.applyPrevGeometry([d2,d1,d4,d3], [...p2,...p1,...p4,...p3]);
    this.saveAnchors();
  }

  flipVertical() {
    var {p1,p2,p3,p4,d1,d2,d3,d4} = this.getPoints();
    this.plane.applyPrevGeometry([d3,d4,d1,d2], [...p3,...p4,...p1,...p2]);
    this.saveAnchors();
  }

  reset() {
    localStorage.removeItem(ANCHOR_KEY);
    const [width, height] = GetSize(this.svgGroup);
    const bbox = GetBoundingBox(this.svgGroup);
    this.scene.remove(this.anchors.group);
    this.scene.remove(this.plane.mesh);
    this.anchors = new Anchors(bbox);
    var plane = new PlaneTransform(this.scene, this.camera, this.renderer, {width, height});
    this.plane = plane;

    this.updateFcts.push(function(delta, now){
      plane.update(delta, now);
    });

    this.planeReady().then((d)=> {
      if (d.status != "failed")
        plane.mesh.position.z = -0.5; // Ensure video plane is behind device
        const rotations = this.numRotations;
        this.numRotations = 0;
        for (var i=0;i<rotations;i++) { this.rotate(); }
    });

  }

  planeReady(_interval=200, _timeout=5000) {
    /* XXX: (Should move this check into three.planetransform) */
    return new Promise((resolve, reject) => {
      let interval;

      interval = setInterval(()=> {
        if (this.plane.mesh) {
          clearInterval(interval);
          resolve({status: "ready", plane: this.plane});
        }
      }, _interval);

      setTimeout(()=> {
        clearInterval(interval);
        resolve({status: "failed", plane: this.plane});
      }, _timeout);
    });
  }

  saveAnchors(anchors) {
    anchors = anchors || this.anchors;
    // Store the current anchor setup
    const anchorData = {};
    var {transform, diagonalRatioArray, positionArray} =
      this.plane.set_anchors(anchors.positions);
    anchorData.positions = anchors.positions;
    anchorData.diagonalRatioArray = diagonalRatioArray;
    anchorData.positionArray = positionArray;
    localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchorData));
  }

  adjustVideoAnchors() {
      if (this.displayAnchors) return;
      const domEvents = new THREEx.DomEvents(this.camera, this.canvas);

      var anchors, transform;

      if (!this.anchors) {
          const bbox = GetBoundingBox(this.svgGroup);
          anchors = new Anchors(bbox);
          // Add anchor meshes to device view scene.
      } else {
          anchors = this.anchors;
      }
      this.scene.add(anchors.group);

      this.plane.updatePos = false;
      this.plane.set_anchors(anchors.positions);

      // Position anchor meshes above video and electrodes.
      anchors.group.position.z = 1;

      for (const [i, anchor] of anchors.shapes.entries()) {
          domEvents.addEventListener(anchor, 'mousedown', (e) => {
            _fp.map(_.partialRight(_.set, "material.opacity", 0.4))(anchors.group.children);
          }, false);
          domEvents.addEventListener(anchor, 'mouseup', (e) => {
            _fp.map(_.partialRight(_.set, "material.opacity", 0.8))(anchors.group.children);
          }, false);
          domEvents.addEventListener(anchor, 'mousemove', (e) => {
            const mesh = e.target;
            const buttons = e.origDomEvent.buttons;
            const intersect = e.intersect;
            if (buttons == 1) {
                // Move anchors and apply transform
                mesh.position.x = intersect.point.x;
                mesh.position.y = intersect.point.y;
                var {transform, diagonalRatioArray, positionArray} =
                  this.plane.set_anchors(anchors.positions);

                // Store the current anchor setup
                this.saveAnchors(anchors);
            }
          }, false);
      }

      document.addEventListener('keydown', (event) => {
        if (event.key != "Shift") return;
        for (const [i, anchor] of anchors.shapes.entries())
          anchor.material.color.setHex("0x00ff00");
        this.plane.updatePos = true;
      }, false);

      document.addEventListener('keyup', (event) => {
        if (event.key != "Shift") return;
        for (const [i, anchor] of anchors.shapes.entries())
          anchor.material.color.setHex("0xff0000");
        this.plane.updatePos = false;
      }, false);

      // Style the anchors (e.g., opacity, color).
      _fp.map(_.partialRight(_.set, "material.opacity", 1))(anchors.group.children);
      _fp.map((mesh) => mesh.material.color.setHex("0xff0000"))(anchors.group.children);
      // Set name attribute of anchor meshes.
      _.forEach(anchors.shapes, (mesh, name) => { mesh.name = name; })

      this.anchors = anchors;
      return anchors;
  }

  destroyVideoAnchors() {
      if (!this.displayAnchors) return;
      this.scene.remove(this.anchors.group);
  }

  get displayAnchors() { return this._displayAnchors || false; }
  set displayAnchors(value) {
    if (value) { this.adjustVideoAnchors(); }
    else { this.destroyVideoAnchors(); }
    this._displayAnchors = value;
  }

}

class Anchors {
    constructor(bounding_box) {
        this.bounding_box = bounding_box;

        const transparent = true;
        const color = "red";
        const radius = .05 * bounding_box.width;

        const material = new THREE.MeshBasicMaterial({color, transparent});

        // Check if anchors are saved in localStorage
        let corners;
        const prevAnchors = JSON.parse(localStorage.getItem(ANCHOR_KEY));
        if (prevAnchors) {
          this.centers = prevAnchors.positions;
        } else {
          this.centers = _fp.pipe(_fp.map(_fp.zipObject(["x", "y"])),
                                          _fp.values)(this.default_positions);
          _.each(this.centers, (o) => o.y -= this.bounding_box.height);
        }

        this.shapes = [];
        for (const [i, pos] of this.centers.entries()) {
          const geometry = new THREE.PlaneGeometry(radius, radius, 30);

          const shape = new THREE.Mesh(geometry, material);
          shape.position.x = pos.x;
          shape.position.y = pos.y;
          shape.scale.x *= 2;
          shape.scale.y *= 2;

          this.shapes.push(shape);
        }

        this.group = new THREE.Group();
        this.group.name = "anchors";
        _fp.forEach((v) => this.group.add(v))(this.shapes);
    }

    get default_positions() {
        // Define center position for control points as the corners of the
        // bounding box.
        var bbox = this.bounding_box;
        return [[bbox.left, bbox.bottom],
                [bbox.right, bbox.bottom],
                [bbox.left, bbox.top],
                [bbox.right, bbox.top]];
    }

    get positions() {
        return _fp.map(_fp.pipe(_fp.at(["position.x", "position.y"]),
                                _fp.zipObject(["x", "y"])))(this.shapes);
    }

    set positions(positions) {
        _.forEach(positions, (p, i) => {
            this.shapes[i].position.x = p[0];
            this.shapes[i].position.y = p[1];
        });
    }
}
module.exports = VideoControls;
