import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, HeatmapChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  DataZoomComponent,
  TitleComponent,
  GraphicComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  DataZoomComponent,
  TitleComponent,
  GraphicComponent,
  CanvasRenderer,
]);

export { echarts };
