import { inject } from "mobx-react";
import { FaChevronDown, FaChevronUp  } from "react-icons/fa";
import { Button } from "../../Common/Button/Button";
import { FieldsButton } from "../../Common/FieldsButton";
import { Space } from "../../Common/Space/Space";

const injector = inject(({ store }) => {
  const view = store?.currentView;

  return {
    view,
    ordering: view?.currentOrder,
  };
});

export const OrderButton = injector(({ size, ordering, view, ...rest }) => {
  return (
    <Space style={{ fontSize: 12 }}>
      <Button.Group collapsed {...rest} >
        <FieldsButton
          size={size}
          style={{ minWidth: 67, textAlign: "left", marginRight: -1 }}
          title={ordering ? ordering.column?.title : "Default Sorting"}
          onClick={(col) => view.setOrdering(col.id)}
          onReset={() => view.setOrdering(null)}
          resetTitle="Default"
          selected={ordering?.field}
          wrapper={({ column, children }) => (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              {children}

              <div
                style={{
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {column?.icon}
              </div>
            </Space>
          )}
        />

        <Button
          size={size}
          style={{ color: "#595959" }}
          disabled={!!ordering === false}
          icon={ordering?.desc ? <FaChevronDown size="12" style={{ color: '#0077ff' }}/> : <FaChevronUp size="12" style={{ color: '#0077ff' }}/>}
          onClick={() => view.setOrdering(ordering?.field)}
        />
      </Button.Group>
    </Space>
  );
});
