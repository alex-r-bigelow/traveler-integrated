/* globals d3, less, GoldenLayout */
import Tooltip from './views/Tooltip/Tooltip.js';
import SummaryView from './views/SummaryView/SummaryView.js';
import LinkedState from './models/LinkedState.js';
import TreeView from './views/TreeView/TreeView.js';
import TreeComparisonView from './views/TreeComparisonView/TreeComparisonView.js';
import CppView from './views/CodeView/CppView.js';
import PythonView from './views/CodeView/PythonView.js';
import PhyslView from './views/CodeView/PhyslView.js';
import GanttView from './views/GanttView/GanttView.js';
import UtilizationView from './views/UtilizationView/UtilizationView.js';
import recolorImageFilter from './utils/recolorImageFilter.js';

const viewClassLookup = {
  TreeView,
  TreeComparisonView,
  CppView,
  PythonView,
  PhyslView,
  GanttView,
  UtilizationView
};

class Controller {
  constructor () {
    this.tooltip = window.tooltip = new Tooltip();
    this.summaryView = new SummaryView(d3.select('.SummaryView'));
    (async () => {
      const datasetList = await d3.json(`/datasets`);
      const metas = await Promise.all(datasetList.map(d => d3.json(`/datasets/${encodeURIComponent(d)}`)));
      this.datasets = {};
      for (const [index, label] of datasetList.entries()) {
        this.datasets[label] = metas[index];
      }
    })();
    this.setupLayout();
  }
  getLinkedState (label) {
    // Get a linkedState object from an existing view that this new one
    // should communicate with, or create it if it doesn't exist
    return (this.views[label] && this.views[label][0].linkedState) ||
        new LinkedState(label, this.datasets[label]);
  }
  setupLayout () {
    this.goldenLayout = new GoldenLayout({
      settings: {
        showPopoutIcon: false
      },
      content: [{
        type: 'stack',
        isCloseable: false,
        content: []
      }]
    }, d3.select('#layoutRoot').node());
    this.views = {};
    for (const [className, ViewClass] of Object.entries(viewClassLookup)) {
      const self = this;
      this.goldenLayout.registerComponent(className, function (container, state) {
        let linkedState = self.getLinkedState(state.label);
        // Create the view
        const view = new ViewClass({ container, state, linkedState });
        // Store the view
        self.views[state.label] = self.views[state.label] || [];
        self.views[state.label].push(view);
        return view;
      });
    }
    this.goldenLayout.on('windowOpened', () => {
      // TODO: deal with popouts
    });
    this.goldenLayout.on('itemDestroyed', component => {
      const recurse = (component) => {
        if (component.instance) {
          this.handleViewDestruction(component.instance);
        } else if (component.contentItems) {
          for (const childComponent of component.contentItems) {
            recurse(childComponent);
          }
        }
      };
      recurse(component);
      this.renderAllViews();
    });
    window.addEventListener('resize', () => {
      this.goldenLayout.updateSize();
      this.renderAllViews();
    });
    window.addEventListener('load', async () => {
      // Don't actually add our image recoloring hacks or initialize
      // GoldenLayout until LESS has finished (the 'load' event sometimes fires
      // before LESS is finished generating styles, especially in firefox)
      await less.pageLoadFinished;
      recolorImageFilter();
      this.goldenLayout.init();
      this.renderAllViews();
    });
  }
  handleViewDestruction (view) {
    // Free up stuff in our lookups for garbage collection when views are closed
    const label = view.layoutState.label;
    if (this.views[label]) {
      this.views[label].splice(this.views[label].indexOf(view), 1);
      if (this.views[label].length === 0) {
        delete this.views[label];
      }
    }
  }
  renderAllViews () {
    this.summaryView.render();
    for (const viewList of Object.values(this.views)) {
      for (const view of viewList) {
        view.render();
      }
    }
  }
  raiseView (view) {
    let child = view.container;
    let parent = child.parent;
    while (!parent !== null && !parent.setActiveContentItem) {
      child = child.parent;
      parent = parent.parent;
    }
    if (parent.setActiveContentItem) {
      parent.setActiveContentItem(child);
    }
  }
  assembleViews (linkedState, targetView = null) {
    const views = linkedState.getPossibleViews();
    let newLayout = { type: 'row', content: [] };
    // Put Gantt and Utilization views in a column
    if (views.GanttView && views.UtilizationView) {
      delete views.GanttView;
      delete views.UtilizationView;
      newLayout.content.push({
        type: 'column',
        content: [{
          type: 'component',
          componentName: 'GanttView',
          componentState: { label: linkedState.label }
        }, {
          type: 'component',
          componentName: 'UtilizationView',
          componentState: { label: linkedState.label }
        }]
      });
    }
    // Put all code views into a stack, and share a column with a tree
    const codeTreeColumn = { type: 'column', content: [] };
    if (views.CppView || views.PythonView || views.PhyslView) {
      const codeStack = { type: 'stack', content: [] };
      for (const componentName in ['CppView', 'PythonView', 'PhyslView']) {
        if (views[componentName]) {
          codeStack.content.push({
            type: 'component',
            componentName,
            componentState: { label: linkedState.label }
          });
        }
        delete views[componentName];
      }
      codeTreeColumn.content.push(codeStack);
    }
    if (views.TreeView) {
      codeTreeColumn.content.push({
        type: 'component',
        componentName: 'TreeView',
        componentState: { label: linkedState.label }
      });
      delete views.TreeView;
    }
    if (codeTreeColumn.content.length > 0) {
      newLayout.content.push(codeTreeColumn);
    }
    // Add any remaining views as a stack (fallback so we don't have to debug
    // layout right off the bat if we want to add more views)
    if (Object.keys(views).length > 0) {
      newLayout.content.push({
        type: 'stack',
        content: Object.keys(views).map(componentName => {
          return {
            type: 'component',
            componentName,
            componentState: { label: linkedState.label }
          };
        })
      });
    }

    // Get a list of old views to purge before creating the new ones:
    const oldItems = this.goldenLayout.root.getItemsByFilter(d => {
      return d.config.componentState &&
        d.config.componentState.label === linkedState.label;
    });
    // Create the new views
    let newContainer = this.goldenLayout.createContentItem(newLayout);
    // Add them
    if (targetView && targetView.container && targetView.container.parent) {
      targetView.container.parent.replaceChild(targetView.container, newContainer);
    } else {
      this.goldenLayout.root.contentItems[0].addChild(newContainer);
    }
    // Purge the old views
    for (const item of oldItems) {
      item.remove();
    }
  }
  getView (className, label) {
    if (className === 'SummaryView') {
      return this.summaryView;
    } else {
      return this.views[label] &&
        this.views[label].find(view => view.constructor.name === className);
    }
  }
  openViews (viewNames, stateObj) {
    for (const viewName of viewNames) {
      const view = this.getView(viewName, stateObj.label);
      if (view) {
        this.raiseView(view);
      } else {
        // TODO: try to position new views intelligently
        this.goldenLayout.root.contentItems[0].addChild({
          type: 'component',
          componentName: viewName,
          componentState: stateObj
        });
      }
    }
  }
}

window.controller = new Controller();
