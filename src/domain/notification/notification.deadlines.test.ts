import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveDueAt, formatDueDate, reminderFor } from './notification.deadlines';

const HOUR = 60 * 60 * 1000;

describe('effectiveDueAt', () => {
  it('moves a bare date to the end of that day', () => {
    assert.equal(effectiveDueAt(new Date('2026-09-25')).toISOString(), '2026-09-26T00:00:00.000Z');
  });

  it('keeps a deadline that carries a time of day', () => {
    assert.equal(effectiveDueAt(new Date('2026-09-25T15:00:00Z')).toISOString(), '2026-09-25T15:00:00.000Z');
  });
});

describe('reminderFor', () => {
  const due = new Date('2026-09-26T00:00:00Z');
  const at = (hoursBeforeDue: number) => new Date(due.getTime() - hoursBeforeDue * HOUR);

  it('says nothing more than three days out', () => {
    assert.equal(reminderFor(at(73), due), null);
  });

  it('gives the three-day reminder inside 72 hours', () => {
    assert.deepEqual(reminderFor(at(72), due), { kind: 'approaching', window: '72h' });
    assert.deepEqual(reminderFor(at(25), due), { kind: 'approaching', window: '72h' });
  });

  it('gives only the one-day reminder inside 24 hours', () => {
    assert.deepEqual(reminderFor(at(24), due), { kind: 'approaching', window: '24h' });
    assert.deepEqual(reminderFor(at(1), due), { kind: 'approaching', window: '24h' });
  });

  it('reminds the day it passes without escalating', () => {
    assert.deepEqual(reminderFor(at(0), due), { kind: 'overdue', daysOverdue: 0, remind: true, escalate: false });
    assert.deepEqual(reminderFor(at(-23), due), { kind: 'overdue', daysOverdue: 0, remind: true, escalate: false });
  });

  it('escalates from a full day late', () => {
    assert.deepEqual(reminderFor(at(-24), due), { kind: 'overdue', daysOverdue: 1, remind: true, escalate: true });
  });

  it('thins overdue reminders to days 0, 1, 3 and then weekly', () => {
    const reminded = Array.from({ length: 22 }, (_, day) => day).filter((day) => {
      const reminder = reminderFor(at(-24 * day - 1), due);
      return reminder?.kind === 'overdue' && reminder.remind;
    });
    assert.deepEqual(reminded, [0, 1, 3, 7, 14, 21]);
  });

  it('escalates on the same days as the reminders, from day one', () => {
    const escalated = Array.from({ length: 22 }, (_, day) => day).filter((day) => {
      const reminder = reminderFor(at(-24 * day - 1), due);
      return reminder?.kind === 'overdue' && reminder.escalate;
    });
    assert.deepEqual(escalated, [1, 3, 7, 14, 21]);
  });
});

describe('formatDueDate', () => {
  it('names the day in UTC so a bare date never slips to the day before', () => {
    assert.equal(formatDueDate(new Date('2026-09-25')), 'Fri 25 Sept');
  });
});
