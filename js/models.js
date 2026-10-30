// ============================================================================
// Data models, defaults, and shared validation
// ============================================================================

/** @typedef {{ x: number, y: number }} Position */
/** @typedef {{ nodes: Position[], color: string, thickness: number, opacity: number }} LineData */
/** @typedef {{ type: 'line', data: LineData }} Line */
/** @typedef {{ id: string | number, name: string, object: Line }} Layer */
/** @typedef {{ selectionOutlineColor: string, outlineThickness: number, handleSize: number, selectedLayerId: string | number | null }} EditorState */

// Services and controls share these limits so validation cannot drift from the UI.
export const SETTING_LIMITS = Object.freeze({
  outlineThickness: Object.freeze({
    min: 1,
    max: 10
  }),
  handleSize: Object.freeze({
    min: 10,
    max: 100
  }),
  thickness: Object.freeze({
    min: 1,
    max: 20
  }),
  opacity: Object.freeze({
    min: 0,
    max: 100
  })
});

// Clamp valid numbers and reject values that cannot describe geometry/settings.
export function clampNumber(value, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Expected a finite number.');
  }

  return Math.max(minimum, Math.min(maximum, value));
}

// Normalize colors to the six-digit format supplied by native color pickers.
export function validateColor(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new TypeError('Expected a six-digit hexadecimal color.');
  }

  return color.toLowerCase();
}

// Accept explicit string or integer IDs without coercing one type into another.
export function validateLayerId(layerId) {
  const validString = typeof layerId === 'string' && layerId.trim().length > 0;
  const validInteger = Number.isSafeInteger(layerId) && layerId >= 0;

  if (!validString && !validInteger) {
    throw new TypeError('Layer IDs must be nonempty strings or nonnegative integers.');
  }

  return layerId;
}

// Require readable names without changing the caller's chosen display text.
function validateLayerName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('Layer names must be nonempty strings.');
  }

  return name;
}

// Validate patches up front so a failed operation cannot partially change state.
export function validateConfiguration(configuration, allowedKeys) {
  if (configuration === null || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new TypeError('Expected a configuration object.');
  }

  for (const propertyName of Object.keys(configuration)) {
    if (!allowedKeys.includes(propertyName)) {
      throw new TypeError(`Unsupported property: ${propertyName}`);
    }
  }
}

// Copy and validate exactly two positions. Viewport clamping belongs to Stage.
export function copyNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length !== 2) {
    throw new TypeError('A line must have exactly two nodes.');
  }

  return Array.from(nodes, (position) => {
    if (
      position === null
      || typeof position !== 'object'
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.y)
    ) {
      throw new TypeError('Each node must contain finite x and y coordinates.');
    }

    return {
      x: position.x,
      y: position.y
    };
  });
}

// Create plain line data, using defaults only for omitted configuration fields.
function createLineData(configuration = {}) {
  validateConfiguration(configuration, ['nodes', 'color', 'thickness', 'opacity']);

  const defaultNodes = [
    {
      x: 100,
      y: 100
    },
    {
      x: 300,
      y: 200
    }
  ];

  return {
    nodes: copyNodes(configuration.nodes === undefined ? defaultNodes : configuration.nodes),
    color: validateColor(configuration.color === undefined ? '#497be8' : configuration.color),
    thickness: clampNumber(
      configuration.thickness === undefined ? 8 : configuration.thickness,
      SETTING_LIMITS.thickness.min,
      SETTING_LIMITS.thickness.max
    ),
    opacity: clampNumber(
      configuration.opacity === undefined ? 100 : configuration.opacity,
      SETTING_LIMITS.opacity.min,
      SETTING_LIMITS.opacity.max
    )
  };
}

// Construct the required Layer -> Line -> data hierarchy without DOM references.
export function createLayerModel(layerId, layerName, lineData) {
  return {
    id: validateLayerId(layerId),
    name: validateLayerName(layerName),
    object: {
      type: 'line',
      data: createLineData(lineData)
    }
  };
}

// Construct editor state independently of form controls and rendered lines.
export function createEditorState() {
  return {
    selectionOutlineColor: '#e78220',
    outlineThickness: 3,
    handleSize: 24,
    selectedLayerId: null
  };
}

// Freeze snapshots recursively so subscribers cannot alter each other's events.
function freezeSnapshot(value) {
  if (value !== null && typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      freezeSnapshot(childValue);
    }

    Object.freeze(value);
  }

  return value;
}

// Return detached, immutable data rather than references to service-owned state.
export function createSnapshot(value) {
  return freezeSnapshot(structuredClone(value));
}

// Preserve the existing placement pattern, bounded to the current stage size.
export function createLinePlacement(stageSize, placementIndex) {
  const verticalOffset = placementIndex % 6 * 26;

  return createLineData({
    nodes: [
      {
        x: stageSize.width * 0.32,
        y: Math.min(stageSize.height, stageSize.height * 0.46 + verticalOffset)
      },
      {
        x: stageSize.width * 0.65,
        y: Math.min(stageSize.height, stageSize.height * 0.65 + verticalOffset)
      }
    ]
  });
}
