import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, Type, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { SCRIPT_EDITOR_COMPONENT } from '@tabbr/module-sdk';
import { Direction, describeRow, effectiveCode, generatedCode } from '../../../../shared/flights/mapping-code';
import { mappingDeclarations } from '../../../../shared/flights/mapping-declarations';
import { DEFAULT_MAPPING, MappingRow, ZA_FIELDS, ZaFieldKey, zaField } from '../../../../shared/flights/mapping-model';
import { FieldCatalog, FieldInfo, Issue } from '../../../../shared/validation-types';
import { MODULE_ID } from '../module-config';

/**
 * Edits the club's mapping between ZweefApp's flight fields and its own Tabbr flight fields: one row per
 * correspondence, per direction (see shared/flights/mapping-model.ts for what each part means). Every row also shows the code
 * that runs for it in each direction (shared/flights/mapping-code.ts) - read-only until the club chooses to adapt it.
 * Works directly on the `rows` array it is given; the settings page saves it. `modified` fires on every edit. What is
 * wrong with a row comes in as `issues` (shared/flights/mapping-validation.ts) and is shown on the row itself.
 */
@Component({
  selector: 'app-mapping-editor',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, NgComponentOutlet, TranslocoDirective],
  styleUrl: './mapping-editor.component.css',
  templateUrl: './mapping-editor.component.html',
})
export class MappingEditorComponent {
  @Input({ required: true }) rows!: MappingRow[];
  /** The club's fields, for the dropdowns; null until loaded (the current values stay selectable meanwhile). */
  @Input() fields: FieldCatalog | null = null;
  @Input() issues: Issue[] = [];
  @Output() modified = new EventEmitter<void>();

  protected readonly moduleId = MODULE_ID;
  protected readonly zaFields = ZA_FIELDS;

  /** The shell's script editor, once loaded (not there in the dev preview: a plain textarea is used then). */
  protected readonly editorType = signal<Type<unknown> | null>(null);

  private readonly open = new Set<MappingRow>();
  private readonly inputCache = new WeakMap<MappingRow, Record<string, { code: string; readOnly: boolean; declarations: string; inputs: Record<string, unknown> }>>();

  /** The row whose code is shown full screen. */
  protected readonly fullscreenRow = signal<MappingRow | null>(null);

  /** Opens the dialog as soon as it is in the page; Esc closes it (the browser's own behaviour, reported by its close event). */
  @ViewChild('fullscreenDialog') protected set fullscreenDialog(element: ElementRef<HTMLDialogElement> | undefined) {
    if (element && !element.nativeElement.open) element.nativeElement.showModal();
  }

  protected openFullscreen(row: MappingRow): void {
    this.fullscreenRow.set(row);
  }

  protected closeFullscreen(): void {
    this.fullscreenRow.set(null);
  }

  protected zaLabel(row: MappingRow): string {
    return zaField(row.za).label;
  }

  constructor() {
    inject(SCRIPT_EDITOR_COMPONENT, { optional: true })?.().then((component) => this.editorType.set(component));
  }

  protected touch(): void {
    this.modified.emit();
  }

  // --- dropdown options ---

  /**
   * The options of a field dropdown: the club's fields, plus the current value when it is not among them (so a field
   * that no longer exists, or that has not been loaded yet, is still shown - and flagged, see label()).
   */
  protected options(current: string, fields: FieldInfo[] | undefined): FieldInfo[] {
    const list = fields ?? [];
    return current && !list.some((field) => field.name === current) ? [...list, { name: current, type: '' }] : list;
  }

  protected entityFields(entity: string): FieldInfo[] | undefined {
    return this.fields?.[entity as "person" | "airplane"];
  }

  protected label(field: FieldInfo, current: string): string {
    if (!field.type) return this.fields ? `⚠ ${field.name}` : field.name;
    return `${field.name}  (${(field.kind || field.type).toLowerCase()})`;
  }

  // --- issues ---

  protected rowIssues(index: number): Issue[] {
    return this.issues.filter((issue) => issue.row === index);
  }

  protected hasIssue(index: number, part: Issue['part']): boolean {
    return this.issues.some((issue) => issue.row === index && issue.part === part && issue.severity === 'error');
  }

  protected severityOf(index: number): 'error' | 'warning' | null {
    const rowIssues = this.rowIssues(index);
    return rowIssues.some((issue) => issue.severity === 'error') ? 'error' : rowIssues.length > 0 ? 'warning' : null;
  }

  protected kindOf(row: MappingRow): string {
    try {
      const type = zaField(row.za).type;
      return type === 'date' || type === 'time' || type === 'number' ? 'plain' : type;
    } catch {
      return 'plain';
    }
  }

  protected describe(row: MappingRow) {
    return describeRow(row);
  }

  // --- links to person / airplane records ---

  protected linkOptions(row: MappingRow): string[] {
    return zaField(row.za).type === 'airplane' ? ['id', 'registratie'] : ['id', 'name'];
  }

  protected setLink(row: MappingRow, entityField: string | undefined, by: string | undefined): void {
    if (by === '') {
      delete row.link;
    } else {
      const current = row.link ?? { entityField: '', by: this.linkOptions(row)[0] as 'id' };
      row.link = { entityField: entityField ?? current.entityField, by: (by ?? current.by) as 'id' | 'name' | 'registratie' };
    }
    this.touch();
  }

  // --- flags and value tables ---

  protected setFlagMode(row: MappingRow, mode: 'boolean' | 'text'): void {
    if (mode === 'boolean') {
      delete row.flagValue;
      delete row.flagMatch;
      delete row.tabbrList;
    } else {
      row.flagValue ??= '';
      this.matchFlagToField(row);
    }
    this.touch();
  }

  protected setTabbrField(row: MappingRow, name: string): void {
    row.tabbrField = name;
    if (row.flagValue != null) {
      // A value of the previous field is rarely one of the new one's.
      const choices = this.choicesOf(name);
      if (choices && !this.flagValues(row).every((value) => choices.some((choice) => choice.value === value))) row.flagValue = '';
      this.matchFlagToField(row);
    }
    this.touch();
  }

  protected setFlagValue(row: MappingRow, value: string): void {
    row.flagValue = value;
    this.matchFlagToField(row);
    this.touch();
  }

  /** The Tabbr field of a row, as the club defined it (undefined while the fields load, or for a field that does not exist). */
  private fieldOf(name: string): FieldInfo | undefined {
    return this.fields?.flight.find((field) => field.name === name);
  }

  /** The values a selection field offers, or null for any other field. */
  protected choicesOf(name: string): { value: string; name: string }[] | null {
    const choices = this.fieldOf(name)?.choices;
    return choices && choices.length > 0 ? choices : null;
  }

  protected isChoice(choices: { value: string }[], value: string): boolean {
    return choices.some((choice) => choice.value === value);
  }

  /** The values a flag row compares with (several for 'oneOf'). */
  private flagValues(row: MappingRow): string[] {
    return (row.flagValue ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  }

  /** One checkbox per choice of a selection field, plus the row's values that are no (longer a) choice, shown flagged. */
  protected choiceBoxes(row: MappingRow, choices: { value: string; name: string }[]): { value: string; name: string; checked: boolean; known: boolean }[] {
    const selected = this.flagValues(row);
    const boxes = choices.map((choice) => ({ ...choice, checked: selected.includes(choice.value), known: true }));
    for (const value of selected) if (!choices.some((choice) => choice.value === value)) boxes.push({ value, name: value, checked: true, known: false });
    return boxes;
  }

  /** Ticks or unticks one value; the values stay in the order of the field's choices, the first one is what a pull writes. */
  protected toggleFlagValue(row: MappingRow, value: string, checked: boolean): void {
    const choices = this.choicesOf(row.tabbrField) ?? [];
    const wanted = new Set(this.flagValues(row));
    if (checked) wanted.add(value); else wanted.delete(value);
    const ordered = [...choices.map((choice) => choice.value).filter((candidate) => wanted.has(candidate)), ...[...wanted].filter((candidate) => !choices.some((choice) => choice.value === candidate))];
    row.flagValue = ordered.join(',');
    this.matchFlagToField(row);
    this.touch();
  }

  /** The offered values, plus the row's current value when it is not among them (shown, and flagged by the validation). */
  protected withCurrent(choices: { value: string; name: string }[], current: string): { value: string; name: string }[] {
    return current && !choices.some((choice) => choice.value === current) ? [...choices, { value: current, name: `⚠ ${current}` }] : choices;
  }

  /**
   * How a yes/no flag reads the Tabbr field: a multi-value field is a list (the flag is yes when the list holds the
   * value), a selection field offers one of its values, anything else is text compared with a value or a list inside it.
   */
  protected flagKind(row: MappingRow): 'list' | 'choice' | 'text' {
    if (this.fieldOf(row.tabbrField)?.multi) return 'list';
    return this.choicesOf(row.tabbrField) ? 'choice' : 'text';
  }

  private matchFlagToField(row: MappingRow): void {
    switch (this.flagKind(row)) {
      case 'list': row.flagMatch = 'contains'; row.tabbrList = true; break;
      case 'choice': row.flagMatch = this.flagValues(row).length > 1 ? 'oneOf' : 'equals'; delete row.tabbrList; break;
      default: row.flagMatch ??= 'equals'; delete row.tabbrList;
    }
  }

  protected addValue(row: MappingRow): void {
    (row.valueMap ||= []).push({ tabbr: '', za: '' });
    this.touch();
  }

  // --- rows ---

  protected add(): void {
    this.rows.push({ za: 'bijzonderheden' as ZaFieldKey, tabbrField: '', push: true, pull: true });
    this.touch();
  }

  /** Moves a row up or down: rows run from top to bottom, so the order decides which row wins when several write the same Tabbr field. */
  protected move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.rows.length) return;
    [this.rows[index], this.rows[target]] = [this.rows[target], this.rows[index]];
    this.touch();
  }

  /** The labels of the later rows that also pull into the same Tabbr field as this one (and so win over it when both apply). */
  protected overriddenBy(index: number): string {
    const row = this.rows[index];
    if (!row?.pull || !row.tabbrField) return '';
    return this.rows
      .slice(index + 1)
      .filter((other) => other.pull && other.tabbrField === row.tabbrField)
      .map((other) => zaField(other.za).label)
      .join(', ');
  }

  protected remove(index: number): void {
    this.rows.splice(index, 1);
    this.touch();
  }

  protected resetToDefault(): void {
    this.rows.splice(0, this.rows.length, ...structuredClone(DEFAULT_MAPPING.rows));
    this.touch();
  }

  // --- code ---

  protected isOpen(row: MappingRow): boolean {
    return this.open.has(row);
  }

  protected setOpen(row: MappingRow, open: boolean): void {
    if (open) this.open.add(row);
    else this.open.delete(row);
  }

  protected hasOwnCode(row: MappingRow, direction: Direction): boolean {
    return !!(direction === 'push' ? row.toZweefApp : row.toTabbr)?.trim();
  }

  protected codeOf(row: MappingRow, direction: Direction): string {
    return effectiveCode(row, direction);
  }

  protected setOwnCode(row: MappingRow, direction: Direction, code: string): void {
    if (!this.hasOwnCode(row, direction)) return;
    if (direction === 'push') row.toZweefApp = code;
    else row.toTabbr = code;
    this.touch();
  }

  /** Starts from what is generated now, so the club adapts it instead of writing from scratch. */
  protected customize(row: MappingRow, direction: Direction): void {
    this.setOwnCodeRaw(row, direction, generatedCode(row, direction));
  }

  protected useGenerated(row: MappingRow, direction: Direction): void {
    this.setOwnCodeRaw(row, direction, undefined);
  }

  private setOwnCodeRaw(row: MappingRow, direction: Direction, code: string | undefined): void {
    if (direction === 'push') row.toZweefApp = code;
    else row.toTabbr = code;
    this.touch();
  }

  private declarationsFor: { fields: FieldCatalog | null; text: string } | null = null;

  /** The typed declarations of the code editors: the club's own fields on the Tabbr side, ZweefApp's fixed fields on the other. */
  private declarations(): string {
    if (this.declarationsFor?.fields !== this.fields) this.declarationsFor = { fields: this.fields, text: mappingDeclarations(this.fields) };
    return this.declarationsFor.text;
  }

  /**
   * The editor's inputs for a row/direction. The object keeps its identity until what it shows changes: a new one on
   * every change detection pass would re-set the editor's inputs each time.
   */
  protected editorInputs(row: MappingRow, direction: Direction, full = false): Record<string, unknown> {
    const code = effectiveCode(row, direction);
    const readOnly = !this.hasOwnCode(row, direction);
    const cache = this.inputCache.get(row) ?? {};
    const declarations = this.declarations();
    const key = full ? `${direction}:full` : direction;
    const cached = cache[key];
    if (cached && cached.readOnly === readOnly && cached.declarations === declarations && (!readOnly ? true : cached.code === code)) {
      return cached.inputs;
    }
    // Inline the editor grows with its code (3 to 20 lines); full screen it fills its column. F11 switches between the two.
    const inputs = {
      value: code,
      readOnly,
      declarations,
      wordWrap: true,
      ...(full ? { height: '100%', onFullscreen: () => this.closeFullscreen() } : { minLines: 3, maxLines: 20, height: '9rem', onFullscreen: () => this.openFullscreen(row) }),
      changed: (value: string) => this.setOwnCode(row, direction, value),
    };
    cache[key] = { code, readOnly, declarations, inputs };
    this.inputCache.set(row, cache);
    return inputs;
  }
}
