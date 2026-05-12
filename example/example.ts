import { queryDom } from './dom';
import { initRendererController, getDisplay, getReadout, setLastState, onViewChange } from './rendererController';
import { initLightingController } from './lightingController';
import { initStateEditor, initInitialState, refreshDrumRotateActive } from './stateEditor';
import { initConfigEditor, syncConfigSelectorVisibility } from './configEditor';
import { initLayoutManager } from './layoutManager';

const els = queryDom();

initRendererController(els);

initConfigEditor(getDisplay, getReadout, setLastState, (state) => refreshDrumRotateActive(state, els), els);

initLightingController(getDisplay, els);

initStateEditor(getDisplay, getReadout, setLastState, els);

onViewChange(() => syncConfigSelectorVisibility(getDisplay, els));

initInitialState(getDisplay, getReadout, setLastState, els);

initLayoutManager(els);

window.__udtdExampleReady = true;
