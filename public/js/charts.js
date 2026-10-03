// Chart.js setup shared by the Progress page and the exercise mini chart.
// Single-series charts only: no legend, one y-axis, crosshair tooltip.
(() => {
  const data = window.CHART_DATA;
  if (!data || !window.Chart) return;

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const dark = () => css('color-scheme') === 'dark';
  const theme = () => ({
    series: dark() ? '#5b8fe0' : '#1f5fbf',
    ink: css('--rubber'),
    grid: css('--rule'),
    surface: css('--sheet'),
  });
  const unit = data.unit;
  const num = (n) => Math.round(n).toLocaleString('en-GB');
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;

  const METRICS = {
    e1rm: { label: 'Estimated 1RM', fmt: (v) => `${v} ${unit}` },
    topWeight: { label: 'Top set', fmt: (v) => `${v} ${unit}` },
    volume: { label: 'Volume', fmt: (v) => `${num(v)} ${unit}` },
  };

  function baseOptions(t, fmtY) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css('--iron'),
          titleColor: css('--chalk'),
          bodyColor: css('--chalk'),
          padding: 10,
          displayColors: false,
          callbacks: { label: (ctx) => fmtY(ctx.parsed.y) },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.ink, maxRotation: 0, autoSkipPadding: 16 } },
        y: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.ink, callback: (v) => num(v), maxTicksLimit: 5 } },
      },
    };
  }

  // Vertical crosshair line on hover.
  const crosshair = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements?.();
      if (!active || !active.length) return;
      const { ctx, chartArea } = chart;
      const x = active[0].element.x;
      ctx.save();
      ctx.strokeStyle = css('--steel');
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  function lineChart(canvas, sessions, metric) {
    const t = theme();
    const m = METRICS[metric];
    const chart = new Chart(canvas, {
      type: 'line',
      plugins: [crosshair],
      data: {
        labels: sessions.map((s) => day(s.date)),
        datasets: [{
          label: m.label,
          data: sessions.map((s) => s[metric]),
          borderColor: t.series,
          backgroundColor: t.series,
          borderWidth: 2,
          pointRadius: sessions.length > 40 ? 0 : 4,
          pointHoverRadius: 6,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,
          tension: 0.25,
        }],
      },
      options: baseOptions(t, m.fmt),
    });
    chart._metric = metric;
    return chart;
  }

  function setMetric(chart, sessions, metric) {
    const m = METRICS[metric];
    chart.data.datasets[0].data = sessions.map((s) => s[metric]);
    chart.data.datasets[0].label = m.label;
    chart.options.plugins.tooltip.callbacks.label = (ctx) => m.fmt(ctx.parsed.y);
    chart._metric = metric;
    chart.update();
  }

  const charts = [];

  if (data.kind === 'exercise-mini') {
    const c = document.getElementById('ex-chart');
    if (c) charts.push(lineChart(c, data.sessions, 'e1rm'));
  }

  if (data.kind === 'progress') {
    const liftCanvas = document.getElementById('lift-chart');
    if (liftCanvas && data.sessions.length) {
      const chart = lineChart(liftCanvas, data.sessions, 'e1rm');
      charts.push(chart);
      document.querySelectorAll('.chart-tabs button').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.chart-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          setMetric(chart, data.sessions, btn.dataset.metric);
        });
      });
    }

    const weekCanvas = document.getElementById('week-chart');
    if (weekCanvas) {
      const t = theme();
      charts.push(new Chart(weekCanvas, {
        type: 'bar',
        data: {
          labels: data.weeks.map((w) => w.label),
          datasets: [{
            label: 'Volume',
            data: data.weeks.map((w) => w.volume),
            backgroundColor: t.series,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: 'bottom',
            maxBarThickness: 28,
          }],
        },
        options: (() => {
          const o = baseOptions(t, (v) => `${num(v)} ${unit}`);
          o.interaction = { mode: 'index', intersect: false };
          o.plugins.tooltip.callbacks.title = (items) => `Week of ${items[0].label}`;
          o.plugins.tooltip.callbacks.afterLabel = (ctx) => {
            const n = data.weeks[ctx.dataIndex].workouts;
            return `${n} ${n === 1 ? 'workout' : 'workouts'}`;
          };
          return o;
        })(),
      }));
    }
  }

  // Re-theme when the OS colour scheme flips.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    for (const c of charts) {
      const t = theme();
      c.data.datasets[0].borderColor = t.series;
      c.data.datasets[0].backgroundColor = t.series;
      c.options.scales.x.ticks.color = c.options.scales.y.ticks.color = t.ink;
      c.options.scales.y.grid.color = t.grid;
      c.update();
    }
  });
})();
