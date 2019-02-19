/* globals d3 */
import GoldenLayoutView from '../common/GoldenLayoutView.js';
import prettyPrintTime from '../../utils/prettyPrintTime.js';

class SummaryView extends GoldenLayoutView {
  constructor () {
    super(...arguments);

    this.pairwiseMode = null;
    this.viewButtons = [
      {
        'view': 'TreeView',
        'icon': 'img/tree.svg',
        'enabled': dataset => !!dataset.coreTree && this.pairwiseMode === null
      },
      {
        'view': 'TreeComparisonView',
        'icon': 'img/compareTrees.svg',
        'enabled': dataset => !!dataset.coreTree && (this.pairwiseMode === null ||
          (this.pairwiseMode.type === 'TreeComparisonView' && this.pairwiseMode.dataset !== dataset)),
        'pairwise': true
      },
      {
        'view': 'CodeView',
        'icon': 'img/code.svg',
        'enabled': dataset => !!dataset.code && this.pairwiseMode === null
      },
      {
        'view': 'GanttView',
        'icon': 'img/gantt.svg',
        'enabled': dataset => !!dataset.ranges && this.pairwiseMode === null
      }
    ];

    (async () => {
      try {
        this.data = await d3.json('/datasets');
      } catch (err) {
        this.data = err;
      }
      this.render();
    })();
  }
  get isLoading () {
    return this.data === undefined;
  }
  get isEmpty () {
    return this.data !== undefined &&
      (this.data instanceof Error || Object.keys(this.data).length === 0);
  }
  setup () {
    super.setup();
  }
  draw () {
    super.draw();

    if (this.data === undefined) {
      return;
    } else if (this.data instanceof Error) {
      this.emptyStateDiv.html('<p>Error communicating with the server</p>');
    } else if (Object.keys(this.data).length === 0) {
      this.emptyStateDiv.html('<p>No data loaded; try:</p><pre>./serve.py --help</pre>');
    }

    this.drawDatasets();
  }
  drawDatasets () {
    const sortedDatasets = Object.values(this.data).sort((a, b) => {
      return Date(a.timestamp) - Date(b.timestamp);
    });

    let datasets = this.content.selectAll('.dataset')
      .data(sortedDatasets, d => d.label);
    datasets.exit().remove();
    const datasetsEnter = datasets.enter().append('div')
      .classed('dataset', true);
    datasets = datasets.merge(datasetsEnter);

    // Use the space to the right of all the labels / buttons for the bar,
    // minus 2em of space for padding between each section
    let availableBarWidth = this.content.node().getBoundingClientRect().width - 4 * this.emSize;
    let labelSpace = 0;
    let buttonSpace = 0;
    const timeScale = d3.scaleLinear()
      .domain([0, d3.max(sortedDatasets.map(d => +d.time))]);

    datasetsEnter.append('h3').classed('name', true);
    datasets.select('.name').text(d => d.label)
      .each(function () {
        labelSpace = Math.max(labelSpace, this.getBoundingClientRect().width);
      });

    datasetsEnter.append('div').classed('timestamp', true);
    datasets.select('.timestamp').text(d => Object.values(d.timestamps)[0] || 'Couldn\'t get timestamp')
      .each(function () {
        labelSpace = Math.max(labelSpace, this.getBoundingClientRect().width);
      });

    availableBarWidth -= labelSpace;

    datasetsEnter.append('div').classed('viewContainer', true);
    this.drawViewButtons(datasets);
    datasets.select('.viewContainer')
      .style('left', (labelSpace + this.emSize) + 'px')
      .each(function () {
        buttonSpace = Math.max(buttonSpace, this.getBoundingClientRect().width);
      });

    availableBarWidth -= buttonSpace;
    timeScale.range([0, availableBarWidth]);

    const barContainerEnter = datasetsEnter.append('div').classed('barContainer', true);
    barContainerEnter.append('div').classed('bar', true);
    barContainerEnter.append('label');
    datasets.select('.barContainer')
      .style('width', availableBarWidth + 'px');
    datasets.select('.barContainer .bar')
      .style('width', d => !isNaN(parseFloat(d.time)) ? timeScale(parseFloat(d.time)) + 'px' : timeScale.range()[1] + 'px')
      .classed('unknown', d => isNaN(parseFloat(d.time)));
    datasets.select('.barContainer label').text(d => !isNaN(parseFloat(d.time)) ? `Inclusive time: ${prettyPrintTime(d.time)}` : 'Inclusive time unknown');

    const pairwiseBannerEnter = datasetsEnter.append('div')
      .classed('pairwiseBanner', true)
      .style('display', 'none');
    pairwiseBannerEnter.append('h3')
      .text('Choose another dataset to compare');
    const cancelButtonEnter = pairwiseBannerEnter.append('div')
      .classed('button', true);
    cancelButtonEnter.append('a');
    cancelButtonEnter.append('span').text('Cancel');
    datasets.select('.pairwiseBanner')
      .style('display', d => this.pairwiseMode && this.pairwiseMode.dataset === d ? null : 'none')
      .select('.button').on('click', () => {
        this.pairwiseMode = null;
        this.render();
      });
  }
  drawViewButtons (datasets) {
    let viewButtons = datasets.select('.viewContainer').selectAll('.button')
      .data(dataset => this.viewButtons.map(button => { return { button, dataset }; }), d => d.button.view);
    viewButtons.exit().remove();
    const viewButtonsEnter = viewButtons.enter().append('div')
      .classed('button', true);
    viewButtons = viewButtons.merge(viewButtonsEnter);

    viewButtonsEnter.append('a').append('img');
    viewButtons.select('img').attr('src', d => d.button.icon);

    viewButtons.classed('disabled', d => !d.button.enabled(d.dataset));

    viewButtons.on('click', d => {
      if (d.button.enabled(d.dataset)) {
        if (d.button.pairwise) {
          if (this.pairwiseMode === null) {
            this.pairwiseMode = {
              type: d.button.view,
              dataset: d.dataset
            };
            this.render();
          } else {
            window.controller.openView(d.button.view, this.pairwiseMode.dataset, d.dataset);
            this.pairwiseMode = null;
            this.render();
          }
        } else {
          window.controller.openView(d.button.view, d.dataset);
        }
      }
    });
  }
}
export default SummaryView;