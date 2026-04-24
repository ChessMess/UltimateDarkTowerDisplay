import { queryDom } from './dom';
import { initRendererController, getDisplay, getReadout, setLastState, onViewChange } from './rendererController';
import { initLightingController, syncLightingEditorVisibility } from './lightingController';
import { initStateEditor, initInitialState } from './stateEditor';
import { initLayoutManager } from './layoutManager';

const els = queryDom();

initRendererController(els);

initLightingController(getDisplay, els);

initStateEditor(getDisplay, getReadout, setLastState, els);

onViewChange(() => syncLightingEditorVisibility(getDisplay, els));

initInitialState(getDisplay, getReadout, setLastState, els);

initLayoutManager(els);

window.__udtdExampleReady = true;
