const yo = require('yo-yo');
const _ = require('lodash');

const MicropedeAsync = require('@micropede/client/src/async.js');
const UIPlugin = require('@scicad/ui-plugin');
const {TabMenu, select, unselect} = require('@scicad/ui-mixins/src/TabMenu.js');
const JsonEditorMixins = require('@scicad/jsoneditor-mixins');

const APPNAME = 'scicad';
const GlobalSchema = {
  type: "object",
  properties: {
    "show-hidden": {
      type: "boolean",
      default: false,
      "per_step": false
    }
  },
};

class GlobalUIPlugin extends UIPlugin {
  constructor(elem, focusTracker, ...args){
    super(elem, focusTracker, ...args);
    _.extend(this, JsonEditorMixins);

    this.menu = yo`<div></div>`;
    this.innerContent = yo`<div></div>`;
    this.editor = this.createEditor(this.innerContent);

    this.element.style.padding = '0px';
    this.element.appendChild(yo`<div>
      ${this.menu}
      ${this.innerContent}
    </div>`);

    this.addEditorListeners();
    this.schema = GlobalSchema;
    this.prevHiddenState = undefined;
    this.once("listening", async () => {
      // Setup meny using plugins with global properties:
      let {plugins, schemas} = await this.listEditablePlugins();
      this.plugins = _.keys(_.pickBy(plugins, {global: true}));
      this.schemas = schemas;
      let args = ['global'];
      let onclick = this.pluginInEditorChanged.bind(this);
      let items = _.map(this.plugins, name => {return {name, args, onclick}});
      this.menu.innerHTML = '';
      this.menu.appendChild(TabMenu(items));
      this.setState("tab-activation-enabled", true);
    });
  }

  async listen() {
    this.trigger("listening");
    this.onTriggerMsg("disable-tab-activation", () => {
      this.setState('tab-activation-enabled', false);
    });
    this.onTriggerMsg("enable-tab-activation", () => {
      this.setState('tab-activation-enabled', true);
    });
    this.onTriggerMsg('change-schema', async (payload) => {
      const LABEL = "global-ui-plugin:change-schema";
      try {
        let activationEnabled = await this.getState('tab-activation-enabled');
        console.log({activationEnabled});
        if (activationEnabled == true) {
          console.log("Activating tab!!");
          this._activateTab();
        }
        await this.pluginInEditorChanged(payload, 'global');
        return this.notifySender(payload, 'done', "change-schema");
      } catch (e) {
        return this.notifySender(payload, DumpStack(LABEL, e), "change-schema", "failed");
      }
    });
    this.onPutMsg('show-hidden', async (payload) => {
      await this.setState('show-hidden', payload['show-hidden']);
      if (payload['show-hidden'] != this.prevState) {
        this.prevState = payload['show-hidden'];
        this.pluginInEditorChanged({name: this.pluginName, override: true});
      }
    });
    let showHidden = await this.getState('show-hidden');
    if (showHidden == undefined) {
      this.setState('show-hidden', false);
    }
  }

}

module.exports = GlobalUIPlugin;
