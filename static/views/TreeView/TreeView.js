import GoldenLayoutView from '../common/GoldenLayoutView.js';
import SvgViewMixin from '../common/SvgViewMixin.js';

class TreeView extends SvgViewMixin(GoldenLayoutView) {
  setup () {
    super.setup();

    this.content.append('text')
      .attr('x', 20)
      .attr('y', 20)
      .text('TODO: Tree View');
  }
  draw () {
    const bounds = this.getContentBounds();
  }
}
export default TreeView;