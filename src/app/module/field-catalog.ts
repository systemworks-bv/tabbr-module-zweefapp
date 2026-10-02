import { HttpClient } from '@angular/common/http';
import { createEntityRestClient } from '@tabbr/module-sdk';
import { firstValueFrom } from 'rxjs';
import { FieldCatalog, FieldInfo } from '../../../shared/validation-types';

/** The module that owns each entity: its settings hold the entity's field definitions. */
const ENTITY_MODULES: Record<string, string> = { flight: 'sys.gliding.flight', person: 'sys.person', airplane: 'sys.gliding.airplane' };

interface Definition {
  kind: string;
  config: any;
}

/**
 * The club's fields per entity. The field metadata only says how a value is stored (a single select is "TEXT" there);
 * what the field really is - its kind, and the choices of a selection field - is in the entity's field definitions,
 * which are part of the module settings of the module the entity belongs to, so those are read too. Returns null when
 * the fields cannot be loaded: nothing can then be checked against them.
 */
export async function loadFieldCatalog(http: HttpClient, apiHost: string, club: string | null | undefined): Promise<FieldCatalog | null> {
  const definitionsOf = async (entity: string): Promise<Map<string, Definition>> => {
    const result = new Map<string, Definition>();
    const moduleId = ENTITY_MODULES[entity];
    if (!club || !moduleId) return result;
    try {
      const settings = await firstValueFrom(http.get<Record<string, any>>(`${apiHost}/api/club/${club}/modulesettings/${moduleId}`));
      const entitySettings = Object.values(settings).find((value) => value && typeof value === 'object' && value.entityName === entity);
      for (const definition of entitySettings?.fields ?? []) {
        let config: any = null;
        try { config = definition.configAsJson ? JSON.parse(definition.configAsJson) : null; } catch { /* a broken config is the club's to fix */ }
        result.set(definition.slot, { kind: String(definition.fieldDefinitionTypeId ?? '').replace(/^tabbr\./, ''), config });
      }
    } catch {
      // Without the definitions a selection field is shown as the text field it is stored as.
    }
    return result;
  };

  const fieldsOf = async (entity: string): Promise<FieldInfo[]> => {
    const [fields, definitions] = await Promise.all([
      createEntityRestClient<unknown>(http, apiHost, entity).getFieldMetadata(),
      definitionsOf(entity),
    ]);
    return fields
      .filter((field) => !field.propertyOrSlot.startsWith('$') && !field.propertyOrSlot.startsWith('lastJobRun_') && !field.propertyOrSlot.startsWith('stats_'))
      .map((field) => {
        const definition = definitions.get(field.propertyOrSlot);
        const choices = definition?.config?.choices;
        return {
          name: field.hardCodedField ? field.propertyOrSlot : field.nameI18n,
          type: field.type,
          kind: definition?.kind,
          targetEntity: (field.config as { entityName?: string } | null)?.entityName,
          choices: Array.isArray(choices) ? choices : undefined,
          multi: field.multi || definition?.config?.multi === true,
        };
      })
      .filter((field) => !!field.name);
  };

  try {
    const [flight, person, airplane] = await Promise.all([fieldsOf('flight'), fieldsOf('person'), fieldsOf('airplane')]);
    return { flight, person, airplane };
  } catch {
    return null;
  }
}
