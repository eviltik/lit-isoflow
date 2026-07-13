import { demoIcons } from './icons.js';

export const demoModel = {
  version: '1.0.0',
  title: 'lit-isoflow demo',
  icons: demoIcons,
  colors: [
    { id: 'blue', value: '#a5b8f3' },
    { id: 'green', value: '#a8e3c0' },
    { id: 'red', value: '#e39d9d' }
  ],
  items: [
    {
      id: 'client1',
      name: 'Poste client',
      icon: 'client',
      description: '<p>Navigateur web</p>'
    },
    { id: 'gw1', name: 'Passerelle', icon: 'gateway' },
    { id: 'web1', name: 'Serveur web 1', icon: 'server' },
    { id: 'web2', name: 'Serveur web 2', icon: 'server' },
    { id: 'db1', name: 'Base de données', icon: 'database' }
  ],
  views: [
    {
      id: 'main',
      name: 'Architecture',
      items: [
        { id: 'client1', tile: { x: -6, y: 0 }, labelHeight: 80 },
        { id: 'gw1', tile: { x: -3, y: 0 }, labelHeight: 80 },
        { id: 'web1', tile: { x: 0, y: 2 }, labelHeight: 80 },
        { id: 'web2', tile: { x: 0, y: -2 }, labelHeight: 80 },
        { id: 'db1', tile: { x: 3, y: 0 }, labelHeight: 80 }
      ],
      connectors: [
        {
          id: 'c1',
          description: 'HTTPS',
          color: 'blue',
          anchors: [
            { id: 'c1a', ref: { item: 'client1' } },
            { id: 'c1b', ref: { item: 'gw1' } }
          ]
        },
        {
          id: 'c2',
          color: 'blue',
          anchors: [
            { id: 'c2a', ref: { item: 'gw1' } },
            { id: 'c2b', ref: { item: 'web1' } }
          ]
        },
        {
          id: 'c3',
          color: 'blue',
          style: 'DASHED',
          anchors: [
            { id: 'c3a', ref: { item: 'gw1' } },
            { id: 'c3b', ref: { item: 'web2' } }
          ]
        },
        {
          id: 'c4',
          color: 'green',
          description: 'SQL',
          anchors: [
            { id: 'c4a', ref: { item: 'web1' } },
            { id: 'c4b', ref: { item: 'db1' } }
          ]
        },
        {
          id: 'c5',
          color: 'green',
          style: 'DOTTED',
          anchors: [
            { id: 'c5a', ref: { item: 'web2' } },
            { id: 'c5b', ref: { item: 'db1' } }
          ]
        }
      ],
      rectangles: [
        { id: 'r1', color: 'green', from: { x: -1, y: 3 }, to: { x: 4, y: -3 } }
      ],
      textBoxes: [
        {
          id: 't1',
          tile: { x: -7, y: 4 },
          content: 'Infrastructure de production'
        }
      ]
    }
  ]
};
