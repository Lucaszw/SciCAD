const Ajv = require('ajv');
const uuid = require('uuid/v4');
const yo = require('yo-yo');
const _ = require('lodash');
const {MicropedeClient} = require('@micropede/client/src/client.js');
const MicropedeAsync = require('@micropede/client/src/async.js');

const APPNAME = 'scicad';
const ajv = new Ajv({useDefaults: true});

const StepMixins = {};
const timeout = ms => new Promise((__,rej) => setTimeout(rej, ms))

const unselect = (b) => {
  b.classList.remove("btn-primary");
  b.classList.add("btn-outline-secondary");
}

const select = (b) => {
  b.classList.remove("btn-outline-secondary");
  b.classList.add("btn-primary");
}

const disableDiv = (div) => {
  div.style.pointerEvents = "none";
  div.style.opacity = 0.5;
  div.style.backgroundColor = "lightgray";
}

const enableDiv = (div) => {
  div.style.pointerEvents = "all";
  div.style.opacity = 1;
  div.style.backgroundColor = "white";
}

let [state1, state2] = ['btn-outline-primary', 'btn-outline-danger'];
let changeButtonToStop = (btn, div) => {
  btn.classList.remove(state1);
  btn.classList.add(state2);
  btn.innerText = "Stop";
  btn.running = true;
  disableDiv(div);
};

let changeButtonToExecute = (btn, div) => {
  btn.classList.remove(state2);
  btn.classList.add(state1);
  btn.innerText = "Execute";
  btn.running = false;
  enableDiv(div);
};

const Step = (state, index, options) => {
  /* Create a Step element with callbacks */
  const id = `step-group-${uuid()}`;

  const inputChanged = (e, ...args) => {
    /* Called when step is being renamed */
    if (e.key == "Enter" || e.type == "blur") {
      options.renameCallback(e.target.value, index);
      return;
    }
  };

  let btn;
  const onClick = (e, ...args) => {
    /* Called when main button is clicked */
    if (btn.classList.contains("btn-outline-secondary")) {
      //If btn is seconday (not loaded) call the load callback
      btn.classList.remove("btn-outline-secondary");
      options.loadCallback(index, null);
    } else {
      // Else if the button is selected then add an input field
      if (btn.innerHTML.trim() == state.__name__.trim()) {
        btn.innerHTML = '';
        let input = yo`
          <input
            value="${state.__name__}"
            onkeypress=${inputChanged.bind(this)}
            onblur=${inputChanged.bind(this)}
          />`;
        btn.appendChild(input);
        input.focus();
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Define the main button in the step (used to attach click and rename)
  // callbacks
  btn = yo`
    <button
      id="step-${index}"
      class="step-main btn btn-sm ${options.isLoaded ? 'btn-primary' : 'btn-outline-secondary'}"
      style="flex-grow: 1;"
      onclick=${onClick}>
      ${state.__name__}
    </button>
  `;

  // Wrap btn in container, with a delete button as its sibling
  return yo`
    <div id="${id}"
      class="btn-group"
      style="width:100%;margin: 3px 0px;">
      ${btn}
      <button
        class="btn btn-sm btn-outline-danger"
        onclick=${options.deleteCallback.bind(this, index, state)}
        style="width:10px;">
        <span style="left: -3px; position: relative;">x</span>
      </button>
    </div>
  `;
}

StepMixins.getAvailablePlugins = async function() {
  const scicad = new MicropedeAsync(APPNAME, undefined, this.port);
  let availablePlugins = [];
  for (let [i, plugin] of this.plugins.entries()) {
    try {
      let pong = await scicad.triggerPlugin(plugin, 'ping', {}, 200);
      if (pong) availablePlugins.push(plugin);
    } catch (e) {
      console.error(e)
    }
  }
  return availablePlugins;
}

StepMixins.toggleExecuteButton = async function(btn, state) {
  if (state == "stopped") changeButtonToExecute(btn, this.steps);
  if (state == "running") changeButtonToStop(btn, this.steps);
}

StepMixins.executeSteps = async function(btn) {
  let scicad;
  // Fetch all subscriptions including the term execute

  if (btn.classList.contains(state2)) {
    // TODO: Should call a 'stop' trigger on all executable plugins
    this.running = false;
    scicad = new MicropedeAsync(APPNAME, undefined, this.port);
    await scicad.triggerPlugin('routes-model', 'stop', {});
    return;
  }

  this.running = true;
  const steps = await this.getState('steps');

  // Before loading steps, get a list of plugins still listening:
  const availablePlugins = await this.getAvailablePlugins();

  // Find which functions have an "execute" function
  let executablePlugins = [];

  await Promise.all(_.map(availablePlugins, async (p) => {
    scicad = new MicropedeAsync(APPNAME, undefined, this.port);
    let subs = await scicad.getSubscriptions(p, 500);
    subs = _.filter(subs, (s)=>_.includes(s, "execute"));
    if (subs.length > 0 ) executablePlugins.push(p);
  }));

  let stepContainer = document.querySelector("#step-container");
  for (let i = await this.getState('loaded-step') || 0;i<steps.length; i++ ){
    if (!this.running) break;
    await this.loadStep(i, availablePlugins);
    let {top} = document.querySelector(`#step-${i}`).getBoundingClientRect();
    stepContainer.scrollTop = top;

    // Wait for all executable plugins to finish
    await Promise.all(_.map(executablePlugins, (p) => {
      //XXX: Right now scicad async clients can only handle one task
      // at a time (so need to have different client for each executable)
      scicad = new MicropedeAsync(APPNAME, undefined, this.port);
      return scicad.triggerPlugin(p, 'execute', {}, -1);
    }));

  }

  this.running = false;
  await scicad.triggerPlugin('routes-model', 'stop', {});
  console.log("Done!");
}

StepMixins.onStepState = async function(payload, params) {
  const steps = payload;
  const loadedStep = await this.getState('loaded-step');
  this.steps.innerHTML = "";

  _.each(steps, (s, i) => {
    let options = {
      loadCallback: this.loadStep.bind(this),
      deleteCallback: this.deleteStep.bind(this),
      renameCallback: this.renameStep.bind(this),
      isLoaded: i==loadedStep
    };
    this.steps.appendChild(Step(s, i, options));
  });
}

StepMixins.onStepReorder = async function(evt) {
  const index1 = evt.oldIndex;
  const index2 = evt.newIndex;
  let prevSteps = await this.getState('steps') || [];
  const item1 = _.cloneDeep(prevSteps[index1]);
  const item2 = _.cloneDeep(prevSteps[index2]);
  prevSteps[index1] = item2;
  prevSteps[index2] = item1;
  await this.setState('steps', prevSteps);
  await this.setState('loaded-step', index2);
}

StepMixins.loadStep = async function(index, availablePlugins, _reverting=false) {
  // Don't permit step load until prevStep is already loaded
  const prevStep = await this.getState('loaded-step') || 0;
  const state = (await this.getState('steps'))[index];
  if (this.loadingStep == true) return;
  if (this.editorUpdating == true) {
    await Promice.race([
      new Promise(res=>this.once("editor-updated", res)),
      new Promise(res=>setTimeout(res, 500))
    ]);
  }

  try {
    // Load the step data
    this.schema_hash = '';
    let s = await this.loadStatesForStep(state, index, availablePlugins);
    if (s.error) throw s.error;

    // Change unloaded steps to secondary buttons, and loaded step
    // to primary button
    let stepElements = [...this.steps.querySelectorAll('.step-main')];
    let btn = this.steps.querySelector(`#step-${index}`);
    _.each(stepElements, unselect);
    select(btn);

    // Change loaded step
    await this.setState('loaded-step', index);

    // If a plugin is selected, update the schemas
    if (this.pluginName) {
      await this.pluginInEditorChanged({name: this.pluginName}, 'step');
    }
  } catch (e) {
    // If error occurs during load, revert to previous step
    console.error("Error occured during load, reverting to prev step.");
    console.error(e);
    if (_reverting == false)
      await this.loadStep(prevStep, availablePlugins, true);
  }
  return;
}

StepMixins.updateStep = async function(pluginName, k, payload) {
  let loadedStep = await this.getState('loaded-step');

  if (await this.loadedStep != undefined) {
    const steps = await this.getState('steps');
    const step = steps[this.loadedStep];
    _.set(step, [pluginName, k], payload);
    this.setState('steps', steps);
  }
}

StepMixins.loadStatesForStep = async function(states, index, availablePlugins) {
  /* Load step data into state, and listen for updates */
  availablePlugins = availablePlugins || this.plugins;
  // TODO: Add an "omit" option to schema
  availablePlugins = _.without(availablePlugins, 'route-controls');

  // Block future calls to loadStep by setting this.loadingStep to true
  this.loadingStep = true;
  let waitingFor = [];

  const createClient = async () => {
    /* Create another client in the background as to not override the schema
       plugin */
    const clientName = `stepClient-${index}-${parseInt(Math.random()*10000)}`;
    const stepClient = new MicropedeClient(APPNAME, undefined,
      this.port, clientName);
    let result = await Promise.race([
      new Promise(async (res) =>{
        if (this.stepClient) {
          // Remove previous client
          await this.stepClient.disconnectClient();
        }
        stepClient.on("connected", res)}),
      timeout(1200)
    ]);
    return stepClient;
  }

  try {
    // Create a new MicropedeClient to handles to step state
    try {
      this.stepClient = await createClient();
    } catch (e) {
      throw `Failed to create stepClient`;
    }

    // Iterate through each plugin + key
    await Promise.race(
      [
        Promise.all(_.map(availablePlugins, async (p) => {
          return await Promise.all(_.map(states[p], async (v,k) => {
            try {
              waitingFor.push({p,k});
              if (!_.get(this, 'stepClient.client.connected')) return;

              // Set the state of each plugin to match step
              await this.dangerouslySetState(k,v,p);

              // Have step listen to any changes mode going forward:
              if (!_.get(this, 'stepClient.client.connected')) return;
              await this.stepClient.onStateMsg(p,k, async (payload, params) => {
                /* Maintain subscriptions to all state messages while the
                step is loaded, and update accordingly */
                if ((await this.getState('loaded-step')) != index) {
                  this.trigger(`${p}-${k}`);
                  return;
                }
                const steps = await this.getState('steps');
                const step = steps[index];
                _.set(step, [p,k], payload);
                await this.setState('steps',steps);

                // Trigger an event on the data has been loaded:
                this.trigger(`${p}-${k}`);
              });
              // Don't resolve until some state data has come int
              await new Promise(res => this.once(`${p}-${k}`, res));
              _.remove(waitingFor, {p,k});
            } catch (e) {
              console.error(e, {p,k,v});
            }
            return;
          }));
        })),
        new Promise((res,rej) => setTimeout(()=>{
          if (waitingFor.length != 0) {
            console.error("Not all states updated correctly:");
            console.error({waitingFor});
          }
          rej({waitingFor});
        }, 2500))
      ]
    );
    this.loadingStep = false;
    this.trigger("step-loaded");
    return {error: false};
  } catch (e) {
    console.error(e);
    this.loadingStep = false;
    this.trigger("step-loaded");
    return {error: e || true};
  }
}

StepMixins.renameStep = async function(name, index) {
  const LABEL = "StepMixins::renameStep";
  try {
    const steps = await this.getState('steps');
    const step = steps[index];
    step.__name__ = name;
    this.setState('steps', steps);
  } catch (e) {
    console.error(LABEL, e);
  }
};

StepMixins.deleteStep = async function(index, step, e) {
  let prevSteps;
  try {
    prevSteps = await this.getState('steps');
  } catch (e) {
    prevSteps = [];
  }

  prevSteps.splice(index, 1);
  this.setState('steps', prevSteps);
}

StepMixins.getStateForPlugin = async function(pluginName, schema) {
  // Get all subscriptions for the schema
  const scicad = new MicropedeAsync(APPNAME, undefined, this.port);
  let subs = await scicad.getSubscriptions(pluginName, 300);

  // Filter subscriptions for those that match a put endpoint
  let puttableProperties = _.compact(_.map(subs, (s) => {
    if (_.includes(s, '/put/')) {
      return s.split(`${APPNAME}/put/${pluginName}/`)[1];
    }
  }));

  // Await the state of every property that has a subscription
  let state = {};
  let dat = _.compact(await Promise.all(_.map(puttableProperties, async (prop) => {
    try {
      let k = prop;
      let v = await this.getState(prop, pluginName);
      if (v != undefined) return {k, v};
      if (v == undefined) return undefined;
    } catch (e) {
      console.error(e);
      return undefined;
    }
  })));

  _.each(dat, (o) => {state[o.k] = o.v});

  // Validate against the schema (which also applies defaults)
  let validate = ajv.compile(schema);
  validate(state);

  // Remove hidden properties, and those that are not changeable on a
  // per step basis
  _.each(_.keys(state), (k) => {
    if (k.slice(0,2) == '__' && k.slice(-2) == '__') {
      delete state[k];
    } else {
      // Get path to prop in schema:
      const p = _.findPath(schema, k);
      if (_.get(schema, `${p}.per_step`) == false)
        delete state[k];
    }
  });
  return state;
}

StepMixins.createStep = async function (e) {
  let state = {};

  // Fetch the entire scicad state
  await Promise.all(_.map(this.plugins, async (plugin) => {
    try {
      let schema    = await this.getSchema(plugin);
      state[plugin] = await this.getStateForPlugin(plugin, schema);
    } catch (e) {
      console.error(e, {plugin});
    }
    return;
  }));

  // Get previous steps
  let prevSteps = await this.getState('steps') || [];

  // Write current state as new step
  state.__name__ = `Step ${_.get(prevSteps, 'length') || 0}`;
  prevSteps.push(state);
  await this.setState('steps', prevSteps);
}

module.exports = StepMixins;
