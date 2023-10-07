import { useMemo } from 'react';
import { Menu } from "../Menu/Menu";
import { BiPencil } from "react-icons/bi";
import { HiOutlineDocumentDuplicate } from "react-icons/hi";
import { RiCloseLine } from "react-icons/ri";


export const TabsMenu = ({
  onClick,
  editable = true,
  closable = true,
  clonable = true,
  virtual = false,
}) => {
  const items = useMemo(() => [{
    key: 'edit',
    title: 'Rename Tab',
    icon: <BiPencil/>,
    enabled: editable && !virtual,
    action: () => onClick("edit"),
  }, {
    key: 'duplicate',
    title: 'Duplicate Tab',
    icon: <HiOutlineDocumentDuplicate/>,
    enabled: !virtual && clonable,
    action: () => onClick("duplicate"),
  }, {
    key: 'save',
    title: 'Save',
    enabled: virtual,
    action: () => onClick("save"),
  }], [editable, closable, clonable, virtual]);

  const showDivider = useMemo(() => closable && items.some(({ enabled }) => enabled), [items]);

  return (
    <Menu size="medium" onClick={(e) => e.domEvent.stopPropagation()}>
      {items.map((item) => item.enabled ? (
        <Menu.Item key={item.key} onClick={item.action}>
          {item.icon}{item.title}
        </Menu.Item>
      ) : null)}

      {closable ? (
        <>
          {/* {showDivider && <Menu.Divider />}  */}
          <Menu.Item onClick={() => onClick("close")}>
            <RiCloseLine/>Close Tab

          </Menu.Item>
        </>
      ) : null}
    </Menu>
  );
};
