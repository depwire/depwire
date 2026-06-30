import { describe, it, expect } from 'vitest';
import { parseHtmlTemplate, parseHtmlFile } from '../src/parser/html.js';

const TEMPLATE = `<div>
  <app-tahaluf-autocomplete [options]="branches">
  </app-tahaluf-autocomplete>
  <user-branch-list *appHighlight></user-branch-list>
  <p>{{ name | translate }}</p>
  <span>{{ when | date:'short' }}</span>
  <button (click)="save()">Save</button>
  <div *ngIf="show">{{ a || b }}</div>
</div>`;

describe('parseHtmlTemplate', () => {
  it('surfaces custom component selectors', () => {
    const { references } = parseHtmlTemplate(TEMPLATE, 'x.component.html');
    const components = references.filter(r => r.type === 'component').map(r => r.name);
    expect(components).toContain('app-tahaluf-autocomplete');
    expect(components).toContain('user-branch-list');
  });

  it('surfaces user pipes but filters built-in pipes', () => {
    const { references } = parseHtmlTemplate(TEMPLATE, 'x.component.html');
    const pipes = references.filter(r => r.type === 'pipe').map(r => r.name);
    expect(pipes).toContain('translate');
    expect(pipes).not.toContain('date'); // built-in pipe -> filtered
  });

  it('surfaces custom structural directives, filters ngIf/ngFor', () => {
    const { references } = parseHtmlTemplate(TEMPLATE, 'x.component.html');
    const directives = references.filter(r => r.type === 'directive').map(r => r.name);
    expect(directives).toContain('appHighlight');
    expect(directives).not.toContain('ngIf');
  });

  it('filters out standard HTML tags', () => {
    const { references } = parseHtmlTemplate(TEMPLATE, 'x.component.html');
    const names = references.map(r => r.name);
    for (const tag of ['div', 'p', 'span', 'button']) {
      expect(names).not.toContain(tag);
    }
  });

  it('does not treat the logical OR operator as a pipe', () => {
    const { references } = parseHtmlTemplate(TEMPLATE, 'x.component.html');
    const pipes = references.filter(r => r.type === 'pipe').map(r => r.name);
    expect(pipes).not.toContain('b');
  });

  it('deduplicates repeated references', () => {
    const dup = `<app-foo></app-foo><app-foo></app-foo>`;
    const { references } = parseHtmlTemplate(dup, 'x.component.html');
    expect(references.filter(r => r.name === 'app-foo').length).toBe(1);
  });
});

describe('parseHtmlFile', () => {
  it('produces a single __template__ node with references metadata', () => {
    const parsed = parseHtmlFile('app/x.component.html', TEMPLATE, '/root');
    expect(parsed.symbols.length).toBe(1);
    const sym = parsed.symbols[0];
    expect(sym.id).toBe('app/x.component.html::__template__');
    expect(sym.kind).toBe('template');
    expect(Array.isArray((sym.metadata as any).references)).toBe(true);
    // parseFile itself emits no edges — pairing pass adds them later.
    expect(parsed.edges.length).toBe(0);
  });
});
