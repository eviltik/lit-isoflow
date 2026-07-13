/**
 * Demo model built on real Isoflow icon packs (@isoflow/isopacks,
 * dev-dependency): the same icons as isoflow.io / FossFLOW.
 * Icon artwork belongs to its respective owners (AWS, Microsoft, Google,
 * CNCF, Isoflow) — see the isopacks repository for licence details.
 */
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import awsIsopack from '@isoflow/isopacks/dist/aws';
import azureIsopack from '@isoflow/isopacks/dist/azure';
import gcpIsopack from '@isoflow/isopacks/dist/gcp';
import kubernetesIsopack from '@isoflow/isopacks/dist/kubernetes';

const flatten = (pack, collection) => {
  return pack.icons.map((icon) => {
    return { ...icon, collection };
  });
};

export const demoIcons = [
  ...flatten(isoflowIsopack, 'Isoflow'),
  ...flatten(awsIsopack, 'AWS'),
  ...flatten(azureIsopack, 'Azure'),
  ...flatten(gcpIsopack, 'GCP'),
  ...flatten(kubernetesIsopack, 'Kubernetes')
];

/**
 * @param {(key: string) => string} t - translator from i18n.js
 * @returns {object} an Isoflow/FossFLOW-compatible model
 */
export const buildDemoModel = (t) => {
  return {
    version: '1.0.0',
    title: t('demo.title'),
    icons: demoIcons,
    colors: [
      { id: 'blue', value: '#a5b8f3' },
      { id: 'green', value: '#a8e3c0' },
      { id: 'yellow', value: '#f3e3a5' },
      { id: 'red', value: '#e3a5a5' },
      { id: 'purple', value: '#d3a5e3' }
    ],
    items: [
      {
        id: 'client1',
        name: t('demo.client'),
        icon: 'laptop',
        description: `<p>${t('demo.clientDescription')}</p>`
      },
      { id: 'gw1', name: t('demo.gateway'), icon: 'router' },
      { id: 'web1', name: t('demo.web1'), icon: 'server' },
      { id: 'web2', name: t('demo.web2'), icon: 'server' },
      { id: 'db1', name: t('demo.database'), icon: 'storage' }
    ],
    views: [
      {
        id: 'main',
        name: t('demo.viewName'),
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
        textBoxes: [{ id: 't1', tile: { x: -7, y: 4 }, content: t('demo.zoneLabel') }]
      }
    ]
  };
};
