import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Player data ──────────────────────────────────────────────────────────────
// Format: [name, nation, pos, age, overall, potential, pac, sho, pas, dri, def, phy, playStyles[], roles[], baseValue]

type PlayerRow = [
  string, string, string, number, number, number,
  number, number, number, number, number, number,
  string[], string[], number
]

const PLAYERS: PlayerRow[] = [
  // ── ELITE (85+) ──
  ['Marco Ferretti',   'IT', 'ST',  27, 92, 92, 88, 94, 78, 89, 42, 84, ['PowerShot','Finesse'],      ['target-forward','poacher'],  85000],
  ['Luca van Dijk',    'NL', 'CB',  29, 91, 91, 76, 32, 72, 68, 94, 90, ['Anticipate','Intercept'],   ['ball-playing-cb','stopper'],  80000],
  ['Rafael Sousa',     'BR', 'CAM', 25, 91, 95, 82, 79, 90, 94, 52, 70, ['Tiki-Taka','Finesse'],      ['playmaker','shadow-striker'],  82000],
  ['Sven Müller',      'DE', 'GK',  30, 90, 90, 72, 20, 65, 55, 88, 82, ['Rush-Out','Saved'],         ['sweeper-keeper','shot-stopper'], 75000],
  ['Kojo Asante',      'GH', 'LW',  24, 90, 94, 96, 82, 80, 92, 44, 72, ['Press','SpeedDribbler'],    ['inside-forward','winger'],     83000],
  ['Tomás Ribeiro',    'PT', 'CM',  26, 89, 91, 78, 72, 88, 84, 74, 80, ['Box-to-Box','LongBall'],    ['box-to-box','deep-lyin'],      78000],
  ['Emre Demir',       'TR', 'RW',  22, 88, 94, 94, 80, 82, 91, 40, 68, ['SpeedDribbler','Finesse'],  ['inside-forward','winger'],     79000],
  ['Carlos Mendez',    'AR', 'ST',  28, 88, 88, 80, 90, 71, 86, 38, 88, ['PowerShot','Target'],       ['false-9','poacher'],           77000],
  ['Ahmed El-Sayed',   'EG', 'CDM', 27, 88, 89, 74, 48, 82, 78, 88, 86, ['Intercept','Tackle'],       ['defensive-mid','holding'],     76000],
  ['Pierre Nkosi',     'SN', 'CB',  25, 87, 90, 82, 35, 70, 72, 90, 88, ['Anticipate','Aerials'],     ['stopper','ball-playing-cb'],   74000],
  ['Jakub Novák',      'CZ', 'LB',  26, 87, 89, 88, 60, 82, 80, 82, 76, ['CrossOver','Tackle'],       ['attacking-fullback','wing-back'], 72000],
  ['Matteo Romano',    'IT', 'CM',  30, 87, 87, 72, 70, 88, 82, 76, 82, ['Tiki-Taka','Press'],        ['box-to-box','playmaker'],      70000],
  ['Yuki Tanaka',      'JP', 'CAM', 23, 87, 93, 86, 75, 87, 90, 48, 64, ['Finesse','Tiki-Taka'],      ['playmaker','shadow-striker'],  78000],
  ['Diogo Carvalho',   'PT', 'RB',  24, 86, 90, 87, 58, 80, 78, 84, 78, ['CrossOver','Intercept'],    ['attacking-fullback','fullback'], 73000],
  ['Samuel Osei',      'GH', 'ST',  26, 86, 88, 84, 87, 68, 82, 40, 86, ['PowerShot','Aerial'],       ['target-forward','complete'],   72000],
  ['Ivan Petrov',      'BG', 'GK',  28, 86, 87, 68, 18, 62, 50, 84, 80, ['Reflexes','Rush-Out'],      ['shot-stopper','sweeper-keeper'], 68000],
  ['Nabil Benali',     'MA', 'LW',  25, 86, 89, 93, 76, 78, 88, 42, 70, ['SpeedDribbler','Press'],    ['winger','inside-forward'],     73000],
  ['Henrik Larsson',   'SE', 'CB',  31, 85, 85, 74, 30, 68, 64, 92, 90, ['Intercept','Aerials'],      ['stopper','ball-playing-cb'],   65000],
  ['Franck Mbeki',     'CM', 'CDM', 29, 85, 86, 76, 50, 80, 76, 86, 84, ['Tackle','Intercept'],       ['holding','defensive-mid'],     66000],
  ['Lorenzo Bianchi',  'IT', 'CAM', 24, 85, 91, 78, 78, 86, 88, 50, 66, ['Finesse','Tiki-Taka'],      ['shadow-striker','playmaker'],  74000],

  // ── GOOD (78–84) ──
  ['Oluwaseun Adeyemi','NG', 'ST',  23, 84, 90, 88, 82, 64, 84, 36, 82, ['PowerShot','Press'],        ['complete','poacher'],          62000],
  ['Anton Schneider',  'DE', 'CM',  27, 84, 86, 76, 68, 84, 80, 72, 80, ['Box-to-Box','LongBall'],    ['box-to-box','holding'],        60000],
  ['Dani Torres',      'ES', 'RW',  21, 84, 92, 92, 72, 80, 88, 38, 66, ['SpeedDribbler','Finesse'],  ['winger','inside-forward'],     65000],
  ['Kenji Watanabe',   'JP', 'CDM', 26, 84, 86, 70, 44, 80, 74, 86, 86, ['Tackle','Intercept'],       ['defensive-mid','holding'],     58000],
  ['Aleksei Volkov',   'RU', 'CB',  28, 84, 85, 72, 28, 66, 62, 90, 88, ['Aerials','Intercept'],      ['stopper','ball-playing-cb'],   60000],
  ['Mario Kessler',    'DE', 'LB',  25, 83, 86, 84, 54, 78, 76, 82, 74, ['CrossOver','Tackle'],       ['attacking-fullback','fullback'], 58000],
  ['Moussa Diallo',    'ML', 'ST',  24, 83, 88, 86, 84, 64, 82, 38, 84, ['PowerShot','Aerial'],       ['target-forward','complete'],   60000],
  ['Paulo Figueira',   'PT', 'CM',  29, 83, 84, 74, 66, 82, 78, 74, 80, ['LongBall','Box-to-Box'],    ['deep-lying','box-to-box'],     56000],
  ['Takeshi Mori',     'JP', 'GK',  26, 83, 85, 65, 14, 58, 48, 80, 76, ['Reflexes','Saved'],         ['shot-stopper'],                55000],
  ['Cédric Fontaine',  'FR', 'RB',  27, 83, 84, 82, 55, 76, 74, 82, 78, ['CrossOver','Intercept'],    ['fullback','attacking-fullback'], 57000],
  ['Ibrahima Traoré',  'GN', 'LW',  22, 83, 90, 92, 70, 74, 86, 36, 68, ['SpeedDribbler','Press'],    ['winger','inside-forward'],     61000],
  ['Bjorn Andersen',   'NO', 'CDM', 30, 82, 82, 70, 46, 76, 70, 84, 88, ['Tackle','Intercept'],       ['holding','defensive-mid'],     54000],
  ['Felipe Castro',    'CL', 'CAM', 25, 82, 86, 80, 72, 82, 86, 46, 62, ['Finesse','Tiki-Taka'],      ['playmaker','shadow-striker'],  58000],
  ['Kwame Boateng',    'GH', 'CB',  26, 82, 84, 78, 30, 64, 68, 88, 86, ['Intercept','Aerials'],      ['stopper'],                     55000],
  ['Nicolás Vega',     'UY', 'ST',  27, 82, 83, 78, 82, 66, 80, 40, 82, ['PowerShot','Target'],       ['complete','poacher'],          56000],
  ['Hamza Khalil',     'MA', 'LB',  24, 82, 87, 86, 52, 76, 78, 80, 72, ['CrossOver','Press'],        ['attacking-fullback','wing-back'], 59000],
  ['Stephan Huber',    'AT', 'CM',  28, 81, 82, 72, 64, 80, 76, 72, 78, ['Box-to-Box','Tiki-Taka'],   ['box-to-box'],                  52000],
  ['Obi Eze',          'NG', 'CF',  23, 81, 88, 88, 80, 70, 84, 38, 76, ['PowerShot','Finesse'],      ['false-9','complete'],          57000],
  ['Radek Horák',      'CZ', 'GK',  29, 81, 82, 64, 12, 55, 46, 78, 78, ['Saved','Reflexes'],         ['shot-stopper'],                52000],
  ['Sofiane Amrani',   'DZ', 'RW',  24, 81, 86, 90, 70, 76, 86, 36, 64, ['SpeedDribbler','Finesse'],  ['winger'],                      56000],
  ['Cristian Pop',     'RO', 'CB',  27, 81, 83, 76, 28, 62, 60, 88, 86, ['Intercept','Tackle'],       ['stopper','ball-playing-cb'],   52000],
  ['Jamal Hassan',     'EG', 'CDM', 28, 80, 81, 72, 44, 74, 72, 84, 84, ['Tackle','Intercept'],       ['holding'],                     50000],
  ['Andrei Ionescu',   'RO', 'LB',  25, 80, 83, 82, 50, 74, 72, 80, 74, ['CrossOver','Tackle'],       ['fullback','attacking-fullback'], 52000],
  ['Jonas Weber',      'DE', 'CAM', 22, 80, 88, 76, 70, 80, 84, 44, 60, ['Tiki-Taka','Finesse'],      ['playmaker'],                   55000],
  ['Kevin Dube',       'ZA', 'ST',  26, 80, 82, 80, 78, 62, 78, 38, 80, ['PowerShot'],                ['poacher','complete'],          50000],
  ['Luís Faria',       'PT', 'RB',  26, 80, 82, 80, 52, 74, 72, 80, 76, ['CrossOver'],                ['fullback'],                    50000],
  ['Yannick Becker',   'DE', 'CM',  30, 79, 79, 70, 62, 78, 74, 72, 78, ['Box-to-Box'],               ['box-to-box'],                  46000],
  ['Emmanuel Adjei',   'GH', 'LW',  21, 79, 87, 90, 66, 72, 82, 34, 64, ['SpeedDribbler'],            ['winger'],                      52000],
  ['Artur Kowalski',   'PL', 'CB',  29, 79, 80, 74, 26, 62, 60, 86, 86, ['Intercept','Aerials'],      ['stopper'],                     48000],
  ['Seun Afolabi',     'NG', 'CAM', 23, 79, 86, 78, 68, 78, 82, 42, 60, ['Finesse'],                  ['shadow-striker'],              51000],
  ['Viktor Kovács',    'HU', 'GK',  27, 79, 81, 62, 10, 52, 44, 76, 76, ['Saved'],                    ['shot-stopper'],                48000],
  ['Diego Varela',     'CO', 'CM',  25, 78, 82, 74, 60, 76, 76, 70, 76, ['LongBall','Box-to-Box'],    ['deep-lying'],                  47000],
  ['Théo Laurent',     'FR', 'RW',  20, 78, 87, 88, 66, 72, 82, 34, 60, ['SpeedDribbler'],            ['winger'],                      50000],
  ['Przemek Wiśniewski','PL', 'CDM', 28, 78, 79, 68, 40, 72, 68, 82, 84, ['Tackle'],                  ['holding'],                     46000],
  ['Kwesi Mensah',     'GH', 'CF',  25, 78, 81, 82, 74, 66, 78, 36, 76, ['PowerShot','Aerial'],       ['target-forward'],              48000],

  // ── SOLID (68–77) ──
  ['Mats Eriksson',    'SE', 'LB',  28, 77, 78, 80, 48, 72, 68, 78, 74, [], ['fullback'],             40000],
  ['Olumide Ojo',      'NG', 'ST',  24, 77, 82, 82, 74, 60, 76, 34, 78, ['PowerShot'], ['complete'],  42000],
  ['Radu Popa',        'RO', 'CB',  26, 77, 79, 72, 24, 60, 58, 84, 84, ['Intercept'], ['stopper'],   40000],
  ['Enzo Pastore',     'IT', 'CAM', 21, 77, 85, 74, 64, 76, 80, 40, 56, ['Finesse'],   ['playmaker'], 44000],
  ['Dariusz Krawczyk', 'PL', 'GK',  28, 77, 78, 60, 8,  50, 42, 74, 74, [],            ['shot-stopper'], 40000],
  ['Marcos Castillo',  'MX', 'RB',  25, 77, 79, 78, 48, 70, 68, 78, 74, [],            ['fullback'],  40000],
  ['Louis Germain',    'BE', 'CM',  27, 76, 77, 70, 56, 74, 72, 70, 76, [],            ['box-to-box'],37000],
  ['Chukwu Eze',       'NG', 'LW',  22, 76, 83, 88, 60, 68, 78, 30, 62, [],            ['winger'],    40000],
  ['Henrique Matos',   'BR', 'CDM', 29, 76, 77, 68, 38, 70, 66, 80, 82, [],            ['holding'],   38000],
  ['Bastian Wolf',     'DE', 'CB',  30, 76, 76, 70, 24, 58, 56, 82, 84, [],            ['stopper'],   36000],
  ['Adewale Bakare',   'NG', 'ST',  25, 76, 79, 78, 72, 58, 74, 32, 78, [],            ['poacher'],   39000],
  ['Patrik Havel',     'SK', 'RB',  26, 75, 76, 76, 46, 68, 66, 76, 74, [],            ['fullback'],  36000],
  ['Mehdi Ziani',      'MA', 'CAM', 23, 75, 82, 72, 62, 72, 78, 36, 54, [],            ['shadow-striker'], 38000],
  ['Vasile Ungureanu', 'RO', 'GK',  30, 75, 75, 58, 6,  48, 40, 72, 72, [],            ['shot-stopper'], 36000],
  ['Timo Brandt',      'DE', 'LB',  24, 75, 78, 78, 44, 68, 66, 76, 72, [],            ['fullback'],  37000],
  ['Babajide Oladipo', 'NG', 'CM',  26, 75, 77, 68, 54, 72, 70, 68, 74, [],            ['box-to-box'],36000],
  ['Santiago Ruiz',    'AR', 'CF',  27, 75, 77, 76, 70, 60, 74, 34, 74, [],            ['false-9'],   37000],
  ['Miroslav Beneš',   'CZ', 'CB',  27, 74, 76, 70, 22, 56, 54, 80, 82, [],            ['stopper'],   35000],
  ['Omar Faruk',       'BD', 'CDM', 28, 74, 75, 66, 36, 68, 64, 78, 80, [],            ['holding'],   34000],
  ['Ignacio Pérez',    'ES', 'RW',  21, 74, 82, 86, 60, 66, 76, 30, 58, [],            ['winger'],    37000],
  ['Cédric Morel',     'FR', 'LB',  27, 74, 75, 76, 42, 66, 64, 74, 72, [],            ['fullback'],  34000],
  ['Osaze Ehigie',     'NG', 'ST',  23, 74, 80, 80, 68, 56, 72, 30, 74, [],            ['complete'],  36000],
  ['Georgi Stoyanov',  'BG', 'GK',  28, 73, 74, 56, 4,  46, 38, 70, 70, [],            ['shot-stopper'], 32000],
  ['Ferdi Yılmaz',     'TR', 'CM',  25, 73, 76, 66, 52, 70, 68, 66, 72, [],            ['deep-lying'],33000],
  ['Nnamdi Okoro',     'NG', 'LW',  22, 73, 80, 86, 56, 62, 74, 28, 58, [],            ['winger'],    35000],
  ['Tiago Duarte',     'PT', 'CB',  29, 73, 74, 68, 20, 54, 52, 78, 80, [],            ['stopper'],   33000],
  ['Slobodan Petrović','RS', 'RB',  27, 72, 73, 74, 44, 64, 62, 74, 72, [],            ['fullback'],  32000],
  ['Julien Morin',     'FR', 'CAM', 22, 72, 80, 70, 58, 68, 74, 32, 50, [],            ['shadow-striker'], 34000],
  ['Ben Okafor',       'NG', 'CDM', 26, 72, 74, 64, 34, 66, 62, 76, 78, [],            ['holding'],   31000],
  ['Ariel Flores',     'MX', 'ST',  25, 71, 75, 76, 64, 54, 68, 28, 70, [],            ['poacher'],   32000],
  ['Mihail Dănilă',    'RO', 'LB',  26, 71, 72, 74, 40, 62, 62, 72, 70, [],            ['fullback'],  30000],
  ['Tomasz Mazur',     'PL', 'CM',  28, 71, 72, 64, 50, 68, 66, 64, 70, [],            ['box-to-box'],30000],
  ['Ismail Coulibaly', 'CI', 'CB',  25, 70, 73, 66, 18, 52, 50, 76, 78, [],            ['stopper'],   29000],
  ['Gustavo Lima',     'BR', 'GK',  27, 70, 72, 54, 4,  44, 36, 68, 68, [],            ['shot-stopper'], 28000],
  ['Ekundayo Abrams',  'NG', 'RW',  21, 70, 79, 84, 56, 60, 72, 26, 54, [],            ['winger'],    31000],
  ['Felix Brunner',    'CH', 'CM',  29, 69, 70, 62, 48, 66, 64, 62, 68, [],            ['deep-lying'],27000],
  ['Taiwo Ogundimu',   'NG', 'ST',  24, 69, 75, 74, 62, 52, 66, 26, 68, [],            ['complete'],  28000],
  ['Václav Horník',    'CZ', 'CB',  30, 69, 69, 64, 16, 50, 48, 74, 76, [],            ['stopper'],   26000],
  ['Bogdan Rusu',      'RO', 'LB',  27, 68, 69, 72, 38, 60, 58, 70, 68, [],            ['fullback'],  26000],
  ['Musa Conteh',      'GM', 'CDM', 27, 68, 70, 62, 32, 62, 60, 74, 76, [],            ['holding'],   26000],

  // ── YOUNG PROSPECTS (60–67) ──
  ['Lorenzo Mazza',    'IT', 'ST',  18, 67, 89, 80, 62, 52, 68, 24, 66, [],            ['complete'],  22000],
  ['Alexei Novak',     'RU', 'CM',  19, 66, 84, 64, 48, 64, 64, 58, 62, [],            ['box-to-box'],18000],
  ['Felix Osei',       'GH', 'LW',  18, 65, 86, 84, 52, 58, 70, 24, 52, [],            ['winger'],    20000],
  ['Mateus Oliveira',  'BR', 'CAM', 19, 65, 87, 70, 56, 66, 72, 30, 48, [],            ['playmaker'], 21000],
  ['Aaron Schmidt',    'DE', 'CB',  19, 64, 82, 68, 16, 48, 48, 70, 70, [],            ['stopper'],   17000],
  ['Abiodun Lawal',    'NG', 'ST',  18, 63, 85, 76, 58, 50, 64, 22, 62, [],            ['poacher'],   18000],
  ['Nicolás Cabrera',  'AR', 'CDM', 19, 62, 81, 60, 30, 60, 58, 70, 72, [],            ['holding'],   15000],
  ['Olusegun Bello',   'NG', 'RW',  18, 61, 83, 82, 50, 54, 66, 22, 48, [],            ['winger'],    16000],
  ['Marcel Pfeifer',   'DE', 'GK',  19, 61, 80, 52, 4,  40, 34, 62, 62, [],            ['shot-stopper'], 14000],
  ['Taiki Fujita',     'JP', 'CM',  18, 60, 82, 62, 44, 62, 62, 54, 60, [],            ['box-to-box'],14000],
]

// Cubic value curve — matches seed-real.ts so prices are consistent
// 60 OVR → 400  |  70 OVR → 3,200  |  80 OVR → 10,800  |  90 OVR → 25,600
function calcValue(overall: number): number {
  if (overall <= 50) return 0
  const x = overall - 50
  return Math.round(x * x * x * 0.4)
}

async function main() {
  console.log('Seeding player database...')

  await prisma.player.deleteMany()

  const data = PLAYERS.map(([name, nationality, position, age, overall, potential,
    pace, shooting, passing, dribbling, defending, physical,
    playStyles, preferredRoles]) => ({
    name: name as string,
    nationality: nationality as string,
    position: position as any,
    age: age as number,
    overall: overall as number,
    potential: potential as number,
    pace: pace as number,
    shooting: shooting as number,
    passing: passing as number,
    dribbling: dribbling as number,
    defending: defending as number,
    physical: physical as number,
    playStyles: playStyles as string[],
    preferredRoles: preferredRoles as string[],
    baseValue: calcValue(overall as number),
  }))

  await prisma.player.createMany({ data })

  console.log(`Seeded ${data.length} players.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
