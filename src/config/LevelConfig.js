// 角色分级表 (11 级)。换皮：替换 assets/images/girl_XX.png 并修改 name/title/ringColor 即可。
// radius: 物理半径(逻辑像素)  score: 合成出该级时获得的分数  ringColor: 描边/特效主色
export const CHARACTERS = [
  { key: 'girl_01', image: 'assets/images/girl_01.png', name: '见习学妹',   title: '刚入学的小可爱',   radius: 22,  score: 1,  ringColor: '#a8d8ff' },
  { key: 'girl_02', image: 'assets/images/girl_02.png', name: '元气同学',   title: '活力满满的同桌',   radius: 30,  score: 3,  ringColor: '#ffb347' },
  { key: 'girl_03', image: 'assets/images/girl_03.png', name: '图书委员',   title: '安静的读书少女',   radius: 39,  score: 6,  ringColor: '#6c7bd9' },
  { key: 'girl_04', image: 'assets/images/girl_04.png', name: '社团部长',   title: '可靠的学生干部',   radius: 49,  score: 10, ringColor: '#7ccf6a' },
  { key: 'girl_05', image: 'assets/images/girl_05.png', name: '偶像练习生', title: '舞台上的新星',     radius: 60,  score: 15, ringColor: '#ff8fc7' },
  { key: 'girl_06', image: 'assets/images/girl_06.png', name: '魔法少女',   title: '守护梦想的魔法',   radius: 72,  score: 21, ringColor: '#b57bff' },
  { key: 'girl_07', image: 'assets/images/girl_07.png', name: '精灵巫女',   title: '森林神社的祈愿',   radius: 85,  score: 28, ringColor: '#e85a5a' },
  { key: 'girl_08', image: 'assets/images/girl_08.png', name: '星辉歌姬',   title: '星光下的歌声',     radius: 99,  score: 36, ringColor: '#36c6e8' },
  { key: 'girl_09', image: 'assets/images/girl_09.png', name: '月之公主',   title: '月宫里的公主',     radius: 114, score: 45, ringColor: '#c9b8ff' },
  { key: 'girl_10', image: 'assets/images/girl_10.png', name: '天空女王',   title: '统御苍穹的女王',   radius: 130, score: 55, ringColor: '#ffd23f' },
  { key: 'girl_11', image: 'assets/images/girl_11.png', name: '星海女神',   title: '传说中的女神',     radius: 148, score: 66, ringColor: '#ff6ad5' },
];

export const MAX_LEVEL = CHARACTERS.length - 1;

export function getCharacterDef(level) {
  return CHARACTERS[Math.max(0, Math.min(MAX_LEVEL, level))];
}
