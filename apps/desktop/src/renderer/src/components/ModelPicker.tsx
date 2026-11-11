import { Icon, MenuItem, Popover } from "@research-workbench/ui";
import { MODEL_PRESETS } from "../models";

/** The header and composer share this selector; settings remain a menu action. */
export function ModelPicker({
  value,
  onChange,
  onOpenSettings,
  side = "bottom",
  ariaLabel = "选择模型"
}: {
  value: string;
  onChange: (value: string) => void;
  onOpenSettings: () => void;
  side?: "top" | "bottom";
  ariaLabel?: string;
}) {
  const options = MODEL_PRESETS.includes(value)
    ? MODEL_PRESETS
    : [value, ...MODEL_PRESETS];
  return (
    <Popover
      ariaLabel={ariaLabel}
      label={
        <>
          <Icon name="bot" />
          <span className="ui-control-label model-name" title={value}>
            {value}
          </span>
        </>
      }
      align="end"
      side={side}
      panelClassName="model-menu"
    >
      {(close) => (
        <>
          <div className="ui-menu-header">
            <strong>选择模型</strong>
          </div>
          {options.map((model) => (
            <MenuItem
              key={model}
              role="menuitemradio"
              aria-checked={model === value}
              active={model === value}
              onClick={() => {
                close();
                onChange(model);
              }}
            >
              <span className="ui-control-label" title={model}>
                {model}
              </span>
              {model === value && <Icon name="check" />}
            </MenuItem>
          ))}
          <div className="ui-menu-separator" />
          <MenuItem
            onClick={() => {
              close();
              onOpenSettings();
            }}
          >
            <Icon name="settings" />
            自定义模型与 API Key…
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
