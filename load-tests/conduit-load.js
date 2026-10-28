import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL) throw new Error('Set BASE_URL to the authorized Railway backend URL');

const articleDuration = new Trend('articles_duration', true);
const tagsDuration = new Trend('tags_duration', true);
const businessErrors = new Rate('business_errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    business_errors: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  const articles = http.get(`${BASE_URL}/api/articles?limit=10&offset=0`, {
    tags: { endpoint: 'articles' },
    timeout: '10s',
  });
  const articlesOk = check(articles, {
    'articles HTTP 200': (r) => r.status === 200,
    'articles response structure': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body.articles) && Number.isInteger(body.articlesCount);
      } catch (_) { return false; }
    },
  });
  articleDuration.add(articles.timings.duration);
  businessErrors.add(!articlesOk);

  sleep(1);

  const tags = http.get(`${BASE_URL}/api/tags`, {
    tags: { endpoint: 'tags' },
    timeout: '10s',
  });
  const tagsOk = check(tags, {
    'tags HTTP 200': (r) => r.status === 200,
    'tags response structure': (r) => {
      try { return Array.isArray(r.json().tags); } catch (_) { return false; }
    },
  });
  tagsDuration.add(tags.timings.duration);
  businessErrors.add(!tagsOk);

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'load-tests/results/summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics || {};
  const fmt = (key, field) => m[key]?.values?.[field] ?? 'n/a';
  return [
    'Conduit E14 - k6 load test',
    `Requests: ${fmt('http_reqs', 'count')}`,
    `Throughput (req/s): ${fmt('http_reqs', 'rate')}`,
    `Average latency (ms): ${fmt('http_req_duration', 'avg')}`,
    `P95 latency (ms): ${fmt('http_req_duration', 'p(95)')}`,
    `HTTP failure rate: ${fmt('http_req_failed', 'rate')}`,
    `Business error rate: ${fmt('business_errors', 'rate')}`,
    `Articles avg/p95 (ms): ${fmt('articles_duration', 'avg')} / ${fmt('articles_duration', 'p(95)')}`,
    `Tags avg/p95 (ms): ${fmt('tags_duration', 'avg')} / ${fmt('tags_duration', 'p(95)')}`,
    '',
  ].join('\n');
}
