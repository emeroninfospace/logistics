frappe.listview_settings['Inbound'] = {
    add_fields: [ "status"],
    get_indicator: function(doc) {
        if (doc.status === "Pending") {
            return [__("Pending"), "orange", "status,=,Pending"];
        }else if (doc.status === "Partially") {
            return [__("Partially"), "yellow", "status,=,Partially"];

        }else if (doc.status === "Completed") {
            return [__("Completed"), "green", "status,=,Completed"];
        }else if (doc.status === "Cancelled") {
            return [__("Cancelled"), "red", "status,=,Cancelled"];
        }
}
}