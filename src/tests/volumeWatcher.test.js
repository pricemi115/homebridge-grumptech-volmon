/* eslint-disable arrow-parens */
/* eslint-disable require-jsdoc */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable new-cap */
/* eslint-disable brace-style */
import {VolumeWatcher, VOLUME_WATCHER_EVENTS, VOLUME_CHANGE_DETECTION_BITMASK_DEF} from '../volumeWatchers.mjs';
import {default as SpawnHelper} from 'grumptech-spawn-helper';

import {fileURLToPath as _fileURLToPath} from 'url';
import {dirname as _dirname} from 'path';

/**
 * @description Absolute path to this script file.
 * @private
 */
const __filename = _fileURLToPath(import.meta.url);
/**
 * @description Absolute path to the folder of this script file.
 * @private
 */
const __dirname = _dirname(__filename);

describe('Module-level tests', ()=>{
    test('Module VolumeWatcher export expected value', ()=>{
        const volWatcher = new VolumeWatcher();
        expect(volWatcher).toBeInstanceOf(VolumeWatcher);
    });
    test('Module Enumerations export expected value', ()=>{
        expect(VOLUME_WATCHER_EVENTS).toBeInstanceOf(Object);
        expect(VOLUME_CHANGE_DETECTION_BITMASK_DEF).toBeInstanceOf(Object);
    });

    describe('Module VOLUME_WATCHER_EVENTS expected value(s)', ()=>{
        test('VOLUME_WATCHER_EVENTS size test', ()=>{
            expect(Object.values(VOLUME_WATCHER_EVENTS).length).toBe(2);
        });
        describe.each([
            ['EVENT_CHANGE_DETECTED',  'EVENT_CHANGE_DETECTED',     'change_detected'],
            ['EVENT_WATCH_ADD_RESULT', 'EVENT_WATCH_ADD_RESULT',    'watch_add_result'],
        ])('Enumeration exists.', (desc, input, result) =>{
            test(desc, ()=>{
                expect(VOLUME_WATCHER_EVENTS).toHaveProperty(input, result);
            });
        });
    });

    describe('Module VOLUME_CHANGE_DETECTION_BITMASK_DEF expected value(s)', ()=>{
        test('VOLUME_CHANGE_DETECTION_BITMASK_DEF size test', ()=>{
            expect(Object.values(VOLUME_CHANGE_DETECTION_BITMASK_DEF).length).toBe(3);
        });
        describe.each([
            ['Add',     'Add',      0x1],
            ['Delete',  'Delete',   0x2],
            ['Modify',  'Modify',   0x4],
        ])('Enumeration exists.', (desc, input, result) =>{
            test(desc, ()=>{
                expect(VOLUME_CHANGE_DETECTION_BITMASK_DEF).toHaveProperty(input, result);
            });
        });
    });
});

describe('VolumeWatcher class tests', ()=>{
    let volWatcher;
    beforeEach(()=>{
        volWatcher = new VolumeWatcher();
    });
    afterEach(()=>{
        volWatcher.Terminate();
    });
    describe('API tests', ()=> {
        test('Terminate', ()=>{
            expect(volWatcher).toHaveProperty('Terminate');
        });
        test('AddWatches', ()=>{
            expect(volWatcher).toHaveProperty('AddWatches');
        });
        test('DeleteWatch', ()=>{
            expect(volWatcher).toHaveProperty('DeleteWatch');
        });
        test('ListWatches', ()=>{
            expect(volWatcher).toHaveProperty('ListWatches');
        });
        test('ValidateAccess', ()=>{
            expect(volWatcher).toHaveProperty('ValidateAccess');
        });
    });
    describe('VolumeWatcher error tests', ()=>{
        describe.each([
            ['Null',                        undefined,          TypeError],
            ['Number',                      42,                 TypeError],
            ['String',                      'waffles',          TypeError],
            ['Object',                      {waffles: 42},      TypeError],
            ['Empty Array',                 [],                 TypeError],
            ['No Target',                   [{foo: 42}],        TypeError],
            ['Invalid Target-Number',       [{target: 42}],     TypeError],
            ['Invalid Target-ZeroString',   [{target: ''}],     TypeError],
        ])('watchList Validation', (desc, watchList, result)=>{
            test(desc, async ()=>{
                await expect(volWatcher.AddWatches(watchList)).rejects.toThrow(result);
            });
        });
    });
    describe('VolumeWatcher tests', ()=>{
        describe.each([
            ['Invalid', [{target: 'foo'}],          false],
            ['Valid',   [{target: `${__dirname}`}], true],
        ])('Functional tests', (desc, watchList, result)=>{
            test(`AddWatches-${desc}`, async ()=>{
                await expect(volWatcher.AddWatches(watchList)).resolves.toBe(result);
            });
            test(`ListWatches-${desc}`, async ()=>{
                const success = await volWatcher.AddWatches(watchList);
                if (success) {
                    expect(volWatcher.ListWatches()).toContain(watchList[0].target);
                }
            });
            test(`DeleteWatch-${desc}`, async ()=>{
                await volWatcher.AddWatches(watchList);
                expect(volWatcher.DeleteWatch(watchList[0].target)).toBe(result);
            });
            test(`WatchAddResult-${desc}`, done =>{
                function handlerWatchAddResult(response) {
                    try {
                        /* Target */
                        expect(response).toHaveProperty('target');
                        expect(response.target).toBe(watchList[0].target);

                        /* Succes */
                        expect(response).toHaveProperty('success');
                        expect(response.success).toBe(result);

                        done();
                    }
                    catch (error) {
                        done(error);
                    }
                };

                volWatcher.on(VOLUME_WATCHER_EVENTS.EVENT_WATCH_ADD_RESULT, handlerWatchAddResult);
                volWatcher.AddWatches(watchList);
            });
            test(`ChangeDetected-${desc}`, done =>{
                const testFile = `test.tst`;
                function handlerChangeDetected(changeType, name) {
                    try {
                        /* Change Type */
                        expect(typeof(changeType)).toBe('string');

                        /* Name */
                        expect(typeof(name)).toBe('string');
                        expect(name).toBe(testFile);

                        done();
                    }
                    catch (error) {
                        done(error);
                    }

                    // Unregister for notifications so that the cleanup does not affect our testing.
                    volWatcher.off(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED, handlerChangeDetected);

                    // Cleanup
                    const spawnHelper = new SpawnHelper();
                    spawnHelper.Spawn({command: 'rm', arguments: [`${__dirname}/${testFile}`]});
                };

                volWatcher.on(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED, handlerChangeDetected);

                volWatcher.AddWatches(watchList).then((success) => {
                    if (success) {
                        // Touch a file.
                        const spawnHelper = new SpawnHelper();
                        spawnHelper.Spawn({command: 'touch', arguments: [`${__dirname}/${testFile}`]});
                    }
                    else {
                        // Nothing to test.
                        done();
                    }
                });
            });
        });
    });
});
