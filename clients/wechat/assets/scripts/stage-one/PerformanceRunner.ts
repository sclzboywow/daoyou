import type {
  PerformanceCue,
  PerformanceScript,
  PerformanceWhen,
} from './StageOneTypes';

export type PerformanceFrame =
  | { kind: 'text'; title: string; kicker?: string; text: string; speaker?: string; place?: string }
  | { kind: 'choice'; title: string; options: string[]; place?: string }
  | { kind: 'end'; title: string; outcome: string; place?: string };

export class PerformanceRunner {
  private cursor = 0;
  private place = '';
  private readonly marks = new Map<string, number>();
  private readonly context: Record<string, string> = {};

  constructor(readonly script: PerformanceScript) {
    script.cues.forEach((cue, index) => {
      if (cue.type === 'mark') this.marks.set(cue.id, index);
    });
  }

  frame(): PerformanceFrame {
    while (this.cursor < this.script.cues.length) {
      const cue = this.script.cues[this.cursor];
      if (cue.type === 'scene') {
        if (this.allowed(cue.when)) this.place = cue.alt ?? this.place;
        this.cursor++;
        continue;
      }
      if (cue.type === 'mark') {
        this.context[`mark.${cue.id}`] = 'true';
        this.cursor++;
        continue;
      }
      if (!this.allowed(cue.when)) {
        this.cursor++;
        continue;
      }
      if (cue.type === 'title' || cue.type === 'narration' || cue.type === 'line') {
        return {
          kind: 'text',
          title: this.script.title,
          kicker: cue.type === 'title' ? cue.kicker : undefined,
          text: cue.text,
          speaker:
            cue.type === 'line'
              ? (this.script.cast[cue.speaker]?.name ?? cue.speaker)
              : undefined,
          place: this.place,
        };
      }
      if (cue.type === 'choice') {
        return {
          kind: 'choice',
          title: this.script.title,
          options: cue.options.map((option) => option.label),
          place: this.place,
        };
      }
      if (cue.type === 'end') {
        return {
          kind: 'end',
          title: this.script.title,
          outcome: cue.outcome,
          place: this.place,
        };
      }
    }
    return { kind: 'end', title: this.script.title, outcome: 'completed', place: this.place };
  }

  advance(): PerformanceFrame {
    const cue = this.script.cues[this.cursor];
    if (cue && ['title', 'narration', 'line'].includes(cue.type)) this.cursor++;
    return this.frame();
  }

  choose(index: number): { frame: PerformanceFrame; outcome?: string } {
    const cue = this.script.cues[this.cursor];
    if (!cue || cue.type !== 'choice') return { frame: this.frame() };
    const option = cue.options[index];
    if (!option) return { frame: this.frame() };
    if (option.outcome) {
      return {
        frame: { kind: 'end', title: this.script.title, outcome: option.outcome, place: this.place },
        outcome: option.outcome,
      };
    }
    if (option.jump) {
      this.context['choice.last'] = option.label;
      this.cursor = (this.marks.get(option.jump) ?? this.cursor) + 1;
    } else {
      this.cursor++;
    }
    return { frame: this.frame() };
  }

  private allowed(when?: PerformanceWhen): boolean {
    if (!when) return true;
    return this.context[when.path] === when.equals;
  }
}
