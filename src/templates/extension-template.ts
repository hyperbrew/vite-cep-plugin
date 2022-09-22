import type { CEP_Extended_Panel } from "../cep-config";

export const extensionTemplate = ({
  id,
  name,
  parameters,
  autoVisible,
  mainPath,
  type,
  panelDisplayName,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  iconNormal,
  iconDarkNormal,
  iconNormalRollOver,
  iconDarkNormalRollOver,
  scriptPath,
  startOnEvents,
}: CEP_Extended_Panel) => `<Extension Id="${id}">
<DispatchInfo>
  <Resources>
    <MainPath>${mainPath}</MainPath>${
  (scriptPath && `<ScriptPath>${scriptPath}</ScriptPath>`) || ""
}<CEFCommandLine>
      ${parameters
        .map((item) => `<Parameter>${item.toString()}</Parameter>`)
        .join("\n")}
    </CEFCommandLine>
  </Resources>
  <Lifecycle>
    <AutoVisible>${autoVisible}</AutoVisible>
    ${
      startOnEvents &&
      `<StartOn>${startOnEvents
        .map((event) => `<Event>${event}</Event>`)
        .join("\n")}</StartOn>`
    } 
  </Lifecycle>
  <UI>
    <Type>${type}</Type>
    ${panelDisplayName ? `<Menu>${panelDisplayName}</Menu>` : ""}
    <Geometry>${
      width && height
        ? `<Size>
        <Width>${width}</Width>
        <Height>${height}</Height>
      </Size>`
        : ""
    }${
  maxWidth && maxHeight
    ? `<MaxSize>
        <Width>${maxWidth}</Width>
        <Height>${maxHeight}</Height>
      </MaxSize>`
    : ""
}${
  minWidth && minHeight
    ? `<MinSize>
        <Width>${minWidth}</Width>
        <Height>${minHeight}</Height>
      </MinSize>`
    : ""
}</Geometry>
    <Icons>
      <Icon Type="Normal">${iconNormal}</Icon>
      <Icon Type="DarkNormal">${iconDarkNormal}</Icon>
      <Icon Type="RollOver">${iconNormalRollOver}</Icon>
      <Icon Type="DarkRollOver">${iconDarkNormalRollOver}</Icon>
    </Icons>
  </UI>
</DispatchInfo>
</Extension>
`;
