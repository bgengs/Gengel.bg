import { AXIS, CATS, css, draw } from './data.js';

/* Three fixed charts plus one trend chart that follows the drill-down level.
   All options live in this one module, so the component can redraw them from
   effects on demand. */
export function trendOpt(level, curRegion, curCity) {
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const scale = level === 0 ? 1 : level === 1 ? .35 : .12;
  let s2 = 90210 + (curRegion || '').length * 31 + (curCity || '').length * 7;
  const r = () => (s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const act = MON.map((_, i) => +(((18 + i * 2.4) * (0.85 + r() * .35)) * scale).toFixed(0));
  const tgt = MON.map((_, i) => +(((22 + i * 1.8)) * scale).toFixed(0));
  const cut = 8;
  const acc = css('--s1');
  return {
    animation: false,
    grid: {left: 56, right: 26, top: 40, bottom: 30},
    legend: {top: 4, right: 6, itemWidth: 14, itemHeight: 4, textStyle: {color: css('--muted'), fontSize: 14}},
    xAxis: {type: 'category', data: MON, boundaryGap: false, ...AXIS(), splitLine: {show: false}},
    yAxis: {type: 'value', name: 'commits', nameTextStyle: {color: css('--muted'), fontSize: 13}, ...AXIS()},
    series: [
      {name: 'Commits', type: 'line', smooth: .3, symbol: 'circle', symbolSize: 6,
       data: act.map((v, i) => i < cut ? v : null),
       lineStyle: {width: 3, color: acc, shadowColor: acc, shadowBlur: 14},
       itemStyle: {color: acc},
       areaStyle: {color: {type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
         {offset: 0, color: 'color-mix(in srgb,' + acc + ' 45%,transparent)'},
         {offset: 1, color: 'color-mix(in srgb,' + acc + ' 0%,transparent)'}]}}},
      {name: 'Goal', type: 'line', smooth: .3, symbol: 'none', data: tgt,
       lineStyle: {width: 2, color: css('--s5'), type: 'dashed'}},
      {name: 'Forecast', type: 'line', smooth: .3, symbol: 'none',
       data: act.map((v, i) => i >= cut - 1 ? v : null),
       lineStyle: {width: 2.4, color: acc, type: 'dotted', opacity: .6}}
    ]
  };
}

export function renderRest() {
  draw('mix', {
    animation: false,
    series: [{
      type: 'pie', radius: ['42%', '64%'], center: ['50%', '52%'],
      itemStyle: {borderColor: css('--panel'), borderWidth: 3},
      color: [css('--s1'), css('--s3'), css('--s2'), css('--s5'), css('--s4')],
      label: {color: css('--ink'), fontSize: 13.5, formatter: '{b}\n{d}%', lineHeight: 17,
              alignTo: 'edge', edgeDistance: 6},
      labelLine: {length: 8, length2: 10, maxSurfaceAngle: 80, lineStyle: {color: css('--line')}},
      data: CATS.map(c => ({name: c.n, value: c.v}))
    }]
  });

  const MON6 = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  draw('cash', {
    animation: false,
    grid: {left: 54, right: 20, top: 34, bottom: 28},
    legend: {top: 2, right: 2, itemWidth: 12, itemHeight: 4, textStyle: {color: css('--muted'), fontSize: 13}},
    xAxis: {type: 'category', data: MON6, ...AXIS(), splitLine: {show: false}},
    yAxis: {type: 'value', name: 'count', nameTextStyle: {color: css('--muted'), fontSize: 13}, ...AXIS()},
    series: [
      {name: 'Commits', type: 'bar', barWidth: 12, data: [42, 46, 38, 51, 49, 54],
       itemStyle: {color: css('--faint'), borderRadius: [2, 2, 0, 0]}},
      {name: 'Deploys', type: 'bar', barWidth: 12, data: [8, 10, 9, 12, 11, 14],
       itemStyle: {color: css('--s1'), borderRadius: [2, 2, 0, 0]}},
      {name: 'Open issues', type: 'line', smooth: .3, symbolSize: 6,
       data: [5, 3, 6, 4, 3, 2],
       lineStyle: {width: 2.4, color: css('--s2'), shadowColor: css('--s2'), shadowBlur: 10},
       itemStyle: {color: css('--s2')}}
    ]
  });
}
