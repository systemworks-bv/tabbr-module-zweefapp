import config from '../../../tabbr.config.json';

/**
 * The module id, as registered with tabbr when you publish. Comes from tabbr.config.json (written
 * by `npm run setup`), so the id your code uses and the id you publish under can't drift apart.
 */
export const MODULE_ID: string = config.moduleId;

/** Title shown in tabbr's menu. */
export const MODULE_TITLE: string = config.title;

/**
 * URL path of your module's page inside tabbr. The module id is unique within the club, so using
 * it as the path can't collide with tabbr's own pages or other modules.
 */
export const MODULE_PATH: string = config.moduleId;
