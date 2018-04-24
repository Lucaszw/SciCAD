var assert = require('assert');
var {spawn} = require('child_process');
var {promisify} = require('util');
var path = require('path');
var _ = require('lodash');
var electron = require('electron');
electron.app.commandLine.appendSwitch('ignore-gpu-blacklist');

var {Console} = require('console');
var console = new Console(process.stdout, process.stderr);

var MicropedeAsync = require('@micropede/client/src/async.js');
var MicroDrop = require('./index.js');

const DEFAULT_DEVICE_JSON = './public/resources/default.json';
const DEFAULT_DEVICE_LENGTH = 92;
const ELECTRODE000_NEIGHBOURS = { left: 'electrode043', down: 'electrode001', right: 'electrode002' };
const ROUTE = { start: 'electrode030', path: ['up', 'up', 'up', 'right', 'right']};
const COMPUTED_ROUTE = ['electrode030','electrode029','electrode091','electrode084','electrode083','electrode082'];

const PORTS = {http_port: 3000, mqtt_ws_port: 8083, mqtt_tcp_port: 1884};

const asyncTimer = (time) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}
let scicad;

describe('MicroDrop', async function() {
  this.timeout(10000);

  before(async () => {
    await MicroDrop(electron, PORTS, undefined, false, true);
    scicad = new MicropedeAsync('scicad', 'localhost', 1884);

    await new Promise((resolve, reject) => {
      electron.ipcMain.on('device-model-ready', function() {
        resolve();
      });

      asyncTimer(10000).then((d) => {
        reject('MicroDrop.before timed out');
      });
    });

  });

  describe('Device', function() {
    this.timeout(5000);

    it('clear loaded device', async function() {
      this.timeout(10000);
      await scicad.putPlugin('device-model', 'three-object', []);
      var arr = await scicad.getState('device-model', 'three-object');
      return assert.equal(arr.length, 0);
    });

    it('put default device', async function() {
        this.timeout(10000);
        // XXX: Using timer to ensure electron app is ready
        var device = require(DEFAULT_DEVICE_JSON);
        await scicad.putPlugin('device-model', 'three-object', device, 5000);
        var objects = await scicad.getState('device-model', 'three-object');
        return assert.equal(objects.length, DEFAULT_DEVICE_LENGTH);
    });

    it('get neighbours', async function() {
      var n1 = (await scicad.triggerPlugin('device-model',
        'get-neighbouring-electrodes', {electrodeId: 'electrode000'})).response;
      assert.deepEqual(n1, ELECTRODE000_NEIGHBOURS);
    });

  });

  describe('Electrodes', async function() {
    it('clear active electrodes', async function() {
      // await scicad.electrodes.putActiveElectrodes([]);
      await scicad.putPlugin('electrodes-model', 'active-electrodes', []);
      var arr = await scicad.getState('electrodes-model', 'active-electrodes');
      // var arr = await scicad.electrodes.activeElectrodes();
      assert.equal(arr.length, 0);
    });

    it('put active electrodes', async function() {
      // await scicad.electrodes.putActiveElectrodes(['electrode000', 'electrode001']);
      await scicad.putPlugin('electrodes-model', 'active-electrodes',
        ['electrode000', 'electrode001']);
      // var arr = await scicad.electrodes.activeElectrodes();
      var arr = await scicad.getState('electrodes-model',
        'active-electrodes');
      assert.equal(arr.length, 2);
    });

  });

  describe('Routes', async function() {
    it('clear routes', async function() {
      // await scicad.routes.putRoutes([]);
      await scicad.putPlugin('routes-model', 'routes', []);
      // var arr = await scicad.routes.routes();
      var arr = await scicad.getState('routes-model', 'routes');
      assert.equal(arr.length, 0);
    });

    it('add route', async function() {
      // await scicad.routes.putRoute(ROUTE);
      await scicad.putPlugin('routes-model', 'route', ROUTE);
      // var arr = await scicad.routes.routes();
      var arr = await scicad.getState('routes-model', 'routes');
      assert.equal(arr.length, 1);
    });

    it('compute electrodes', async function() {
      // var route = (await scicad.routes.routes())[0];
      var route = (await scicad.getState('routes-model', 'routes'))[0];
      // var ids = (await scicad.device.electrodesFromRoute(route)).ids;
      var ids = (await scicad.triggerPlugin('device-model',
        'electrodes-from-routes', {routes: [route]})).response[0].ids
      assert.deepEqual(ids,COMPUTED_ROUTE);
    });

    it('execute', async function() {
      // await scicad.electrodes.putActiveElectrodes([]);
      await scicad.putPlugin('electrodes-model', 'active-electrodes', []);
      // var route = (await scicad.routes.routes())[0];
      var route = (await scicad.getState('routes-model', 'routes'))[0];
      route['transition-duration-seconds'] = 0.1;
      // await scicad.routes.execute([route], -1);
      await scicad.triggerPlugin('routes-model', 'execute',
        {routes: [route]}, -1);
      // var activeElectrodes = await scicad.electrodes.activeElectrodes();
      var activeElectrodes = await scicad.getState('electrodes-model',
        'active-electrodes');
      assert.deepEqual(activeElectrodes,[_.last(COMPUTED_ROUTE)]);
    });

  });

  // XXX: Currently pluginManager fails on travis
  // describe('PluginManager', async function() {
  //   // it('get process plugins', async function(){
  //   //
  //   //   const expected = _.map(require('./plugins.json')['processPlugins'], "name");
  //   //   var plugins = await scicad.pluginManager.getProcessPlugins();
  //   //   assert.deepEqual(_.map(plugins, 'name'), expected);
  //   // });
  //
  // });


  after(function () {
    console.log("tests complete");
    // w.close();
    // process.exit(0);
  });


});
