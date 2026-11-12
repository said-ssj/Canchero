import { insertEmoji } from './emoji-insertion';
describe('Insertar emojis', () => {
  it('inserts at the caret and replaces a selection without discarding the surrounding message', () => {
    expect(insertEmoji('Hola equipo', '⚽', 5, 5, 30)).toEqual({
      value: 'Hola ⚽equipo',
      caret: 6,
    });
    expect(insertEmoji('Hola equipo', '🏆', 5, 11, 30)).toEqual({ value: 'Hola 🏆', caret: 7 });
  });
  it('keeps a complete Unicode sequence and rejects overflow instead of cutting the emoji', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(insertEmoji('x', family, 1, 1, 2)).toBeNull();
    expect(insertEmoji('', family, 0, 0, 50)?.value).toBe(family);
  });
});
