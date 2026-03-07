// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt

let previous_conversion_rate = 1;

frappe.ui.form.on('Outbound', {
    refresh(frm) {
        previous_conversion_rate = flt(frm.doc.conversion_rate) || 1;
        
        if (frm.doc.docstatus == 0) {
            frm.add_custom_button(__('Get Job Order'), function() {
                get_job_orders(frm);
            });
        }
    },

    terms: function(frm) {
        erpnext.utils.get_terms(frm.doc.terms, frm.doc, function(r) {
            if(!r.exc) {
                frm.set_value("terms_and_condition", r.message);
            }
        });
    },

    ship_to: function(frm) {
        if (frm.doc.ship_to) {
            frappe.call({
                method: "frappe.contacts.doctype.address.address.get_address_display",
                args: { address_dict: frm.doc.ship_to },
                callback: function(r) {
                    frm.set_value("ship_to_address", r.message);
                },
            });
        }
        if (!frm.doc.ship_to) {
            frm.set_value("ship_to_address", "");
        }
    },

    bill_to: function(frm) {
        if (frm.doc.bill_to) {
            frappe.call({
                method: "frappe.contacts.doctype.address.address.get_address_display",
                args: { address_dict: frm.doc.bill_to },
                callback: function(r) {
                    frm.set_value("bill_to_address", r.message);
                },
            });
        }
        if (!frm.doc.supplier_address) {
            frm.set_value("bill_to_address", "");
        }
    },

    on_behalf_of: function(frm) {
        if (frm.doc.on_behalf_of) {
            frappe.call({
                method: "frappe.contacts.doctype.address.address.get_address_display",
                args: { address_dict: frm.doc.on_behalf_of },
                callback: function(r) {
                    frm.set_value("on_behalf_address", r.message);
                },
            });
        }
        if (!frm.doc.on_behalf_of) {
            frm.set_value("on_behalf_address", "");
        }
    },

    onload_post_render(frm) {
        if (frm.is_new()) {
            frm.doc.destination = null;
            frm.doc.exit_point  = null;
            frm.refresh_field("destination");
            frm.refresh_field("exit_point");
        }
    },

    currency: function(frm) {
        let company_currency = "AED";
        if (frm.doc.currency && frm.doc.currency !== company_currency) {
            frappe.call({
                method: "erpnext.setup.utils.get_exchange_rate",
                args: {
                    transaction_date: frm.doc.posting_date,
                    from_currency:    frm.doc.currency,
                    to_currency:      company_currency,
                    args:             "for_selling",
                },
                freeze: true,
                freeze_message: __("Fetching exchange rates ..."),
                callback: function(r) {
                    frm.set_value("conversion_rate", flt(r.message));
                },
            });
        } else {
            frm.set_value("conversion_rate", 1);
        }
    },

    conversion_rate: function(frm) {
        recalculate_all_rows(frm);
        previous_conversion_rate = flt(frm.doc.conversion_rate) || 1;
    },
});

frappe.ui.form.on("Outbound Item", {
    qty:        (frm, cdt, cdn) => calculate_item_total(frm, cdt, cdn),
    unit_price: (frm, cdt, cdn) => calculate_item_total(frm, cdt, cdn),
    gross_wt:   (frm, cdt, cdn) => calculate_totals(frm),
    length:     (frm, cdt, cdn) => calculate_cbm(frm, cdt, cdn),
    width:      (frm, cdt, cdn) => calculate_cbm(frm, cdt, cdn),
    height:     (frm, cdt, cdn) => calculate_cbm(frm, cdt, cdn),
});

function calculate_item_total(frm, cdt, cdn) {
    let row        = locals[cdt][cdn];
    let qty        = flt(row.qty);
    let unit_price = flt(row.unit_price);
    let total      = qty * unit_price;

    frappe.model.set_value(cdt, cdn, 'total_value', total);
    frappe.model.set_value(cdt, cdn, 'base_total',  total); // ✅ mirrors total_value

    if (flt(row.unit_wt) > 0) {
        frappe.model.set_value(cdt, cdn, 'gross_wt', flt(row.unit_wt) * qty);
    }

    calculate_totals(frm);
}

function recalculate_all_rows(frm) {
    let new_rate   = flt(frm.doc.conversion_rate) || 1;
    let old_rate   = flt(previous_conversion_rate) || 1;
    let is_foreign = frm.doc.currency !== "AED";

    (frm.doc.items || []).forEach(item => {
        let qty = flt(item.qty);

        let unit_price, total_value;

        if (is_foreign) {
            // ✅ Reverse unit_price back to AED using OLD rate, then convert to new rate
            let unit_price_aed = flt(item.unit_price) * old_rate;  // foreign → AED
            unit_price         = unit_price_aed / new_rate;        // AED → new foreign
        } else {
            unit_price = flt(item.unit_price); // AED stays the same
        }

        total_value = qty * unit_price;

        // ✅ Use frappe.model.set_value so UI updates properly
        frappe.model.set_value(item.doctype, item.name, 'unit_price',  unit_price);
        frappe.model.set_value(item.doctype, item.name, 'total_value', total_value);
        frappe.model.set_value(item.doctype, item.name, 'base_total',  total_value);
    });

    frm.refresh_field("items");
    calculate_totals(frm);
}

function calculate_totals(frm) {
    let total_qty      = 0;
    let total_value    = 0;
    let total_base     = 0;
    let total_gross_wt = 0;

    (frm.doc.items || []).forEach(item => {
        total_qty      += flt(item.qty);
        total_value    += flt(item.total_value);
        total_base     += flt(item.base_total);
        total_gross_wt += flt(item.gross_wt);
    });

    frm.set_value('total_qty',      total_qty);
    frm.set_value('total_value',    total_value);
    frm.set_value('total_gross_wt', total_gross_wt);
    frm.set_value('base_total',     total_base);
    frm.refresh_fields(['total_qty', 'total_value', 'total_gross_wt', 'base_total']);
}

function calculate_cbm(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let l = flt(row.length);
    let w = flt(row.width);
    let h = flt(row.height);
    if (l > 0 && w > 0 && h > 0) {
        row.cbm = (l / 100) * (w / 100) * (h / 100);
    }
    frm.refresh_field("items");
}

function get_job_orders(frm) {
    let selected_rows_map = {};

    let dialog = new frappe.ui.Dialog({
        title: __('Select Inbound'),
        fields: [
            {
                fieldname: 'customer',
                label: __('Customer'),
                fieldtype: 'Link',
                options: 'Customer'
            },
            {
                fieldname: 'supplier',
                label: __('Supplier'),
                fieldtype: 'Link',
                options: 'Supplier'
            },
            {
                fieldname: 'column_break',
                label: __(''),
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'from_date',
                label: __('From Date'),
                fieldtype: 'Date',
                default: frappe.datetime.add_days(frappe.datetime.get_today(), -30)
            },
            {
                fieldname: 'job_type',
                label: __('Job Type'),
                fieldtype: 'Select',
                options: '\nTransfer\nImport\nExport',
            },
            {
                fieldname: 'column_break1',
                label: __(''),
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'to_date',
                label: __('To Date'),
                fieldtype: 'Date',
                default: frappe.datetime.get_today()
            },
            {
                fieldname: 'boe_no',
                label: __('BOE No'),
                fieldtype: 'Data'
            },
            {
                fieldname: 'section_break',
                label: __(''),
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'job_orders',
                label: __('Inbound'),
                fieldtype: 'Table',
                cannot_add_rows: true,
                cannot_delete_rows: true,
                data: [],
                fields: [
                    {
                        fieldname: 'posting_date',
                        label: __('Date'),
                        fieldtype: 'Date',
                        in_list_view: 1,
                        width: 100
                    },
                    {
                        fieldname: 'name',
                        label: __('Inbound ID'),
                        fieldtype: 'Link',
                        options: 'Inbound',
                        in_list_view: 1,
                        width: 150
                    },
                    {
                        fieldname: 'customer',
                        label: __('Customer'),
                        fieldtype: 'Link',
                        options: 'Customer',
                        in_list_view: 1,
                        width: 150
                    },
                    {
                        fieldname: 'total_qty',
                        label: __('Total Qty'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        width: 100
                    },
                    {
                        fieldname: 'total_value',
                        label: __('Total Value'),
                        fieldtype: 'Currency',
                        in_list_view: 1,
                        width: 120
                    },
                    {
                        fieldname: 'total_gross_wt',
                        label: __('Total Weight'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        width: 120
                    }
                ]
            }
        ],
        primary_action_label: __('Get Items'),
        size: 'extra-large',
        primary_action(values) {
            if (values.job_orders && values.job_orders.length > 0) {
                values.job_orders.forEach(row => {
                    if (row.__checked === 1) {
                        selected_rows_map[row.name] = row;
                    } else {
                        delete selected_rows_map[row.name];
                    }
                });
            }

            let selected_job_orders = Object.values(selected_rows_map);

            if (selected_job_orders.length === 0) {
                frappe.show_alert({message: __('Please select at least one inbound'), indicator: 'red'});
                return;
            }

            fetch_and_add_items(frm, selected_job_orders, values);
            dialog.hide();
        }
    });

    dialog.set_df_property('job_orders', 'cannot_add_rows', true);

    let refresh_job_orders = function() {
        let current_data = dialog.get_value('job_orders') || [];
        current_data.forEach(row => {
            if (row.__checked === 1) {
                selected_rows_map[row.name] = row;
            } else {
                delete selected_rows_map[row.name];
            }
        });

        let filters = {
            docstatus: 1,
            status: ['in', ['Pending', 'Partially']]
        };

        if (dialog.get_value('customer'))  filters.customer     = dialog.get_value('customer');
        if (dialog.get_value('supplier'))  filters.supplier     = dialog.get_value('supplier');
        if (dialog.get_value('job_type'))  filters.job_type     = dialog.get_value('job_type');
        if (dialog.get_value('boe_no'))    filters.boe_no       = dialog.get_value('boe_no');
        if (dialog.get_value('from_date')) filters.posting_date = ['>=', dialog.get_value('from_date')];
        if (dialog.get_value('to_date'))   filters.posting_date = ['<=', dialog.get_value('to_date')];

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Inbound',
                fields: ['name', 'posting_date', 'customer', 'total_qty', 'total_value', 'total_gross_wt'],
                filters: filters,
                limit_page_length: 50
            },
            callback(r) {
                let data = r.message || [];
                data.forEach(row => {
                    if (selected_rows_map[row.name]) {
                        row.__checked = 1;
                    }
                });
                dialog.set_df_property('job_orders', 'data', data);
                dialog.refresh();
            }
        });
    };

    dialog.fields_dict.customer.df.onchange  = refresh_job_orders;
    dialog.fields_dict.supplier.df.onchange  = refresh_job_orders;
    dialog.fields_dict.from_date.df.onchange = refresh_job_orders;
    dialog.fields_dict.to_date.df.onchange   = refresh_job_orders;
    dialog.fields_dict.job_type.df.onchange  = refresh_job_orders;
    dialog.fields_dict.boe_no.df.onchange    = refresh_job_orders;

    dialog.show();
    refresh_job_orders();
}

function fetch_and_add_items(frm, selected_rows, filters) {
    let job_order_names = selected_rows.map(row => row.name);
    console.log('Selected inbound:', job_order_names);

    frappe.call({
        method: 'logistics.logistics.doctype.outbound.outbound.get_job_order_items',
        args: { job_order: job_order_names },
        callback(r) {
            if (r.message && r.message.length > 0) {
                let added_count        = 0;
                let zero_balance_count = 0;

                let outbound_currency  = frm.doc.currency || "AED";
                let outbound_conv_rate = flt(frm.doc.conversion_rate) || 1;
                let is_foreign_outbound = outbound_currency !== "AED";

                r.message.forEach(item => {
                    if (item.balance_qty <= 0) {
                        zero_balance_count++;
                        return;
                    }

                    let child = frm.add_child('items');
                    let qty   = item.balance_qty || 0;

                    let inbound_conv_rate  = flt(item.inbound_conversion_rate) || 1;
                    let is_foreign_inbound = (item.inbound_currency || "AED") !== "AED";

                    // Step 1: unit_price → AED
                    let unit_price_aed = is_foreign_inbound
                        ? (item.unit_price || 0) * inbound_conv_rate
                        : (item.unit_price || 0);

                    // Step 2: AED → outbound currency
                    let unit_price = is_foreign_outbound
                        ? unit_price_aed / outbound_conv_rate
                        : unit_price_aed;

                    // total_value & base_total both in outbound currency
                    let total_value = qty * unit_price;
                    let base_total  = total_value; // ✅ same currency as total_value

                    child.part_no              = item.part_no || '';
                    child.qty                  = qty;
                    child.uom                  = item.uom || '';
                    child.item_code            = item.item_code || '';
                    child.unit_price           = unit_price;
                    child.total_value          = total_value;
                    child.base_total           = base_total;
                    child.hs_code              = item.hs_code || '';
                    child.unit_wt              = item.unit_wt || 0;
                    child.gross_wt             = (item.unit_wt * qty) || 0;
                    child.coo                  = item.coo || '';
                    child.ref                  = item.ref || '';
                    child.description          = item.description || '';
                    child.material_description = item.hs_description || '';
                    child.reference_id         = item.parent || '';
                    child.boe_no               = item.boe_no || '';
                    child.order_item           = item.name || '';
                    added_count++;
                });

                frm.refresh_field('items');
                calculate_totals(frm);

                let messages = [];
                if (added_count > 0)        messages.push(`${added_count} items added`);
                if (zero_balance_count > 0) messages.push(`${zero_balance_count} items fully consumed`);

                if (messages.length > 0) {
                    frappe.show_alert({
                        message: messages.join(', '),
                        indicator: added_count > 0 ? 'green' : 'orange'
                    });
                } else {
                    frappe.show_alert({message: __('No items available to add'), indicator: 'yellow'});
                }
            } else {
                frappe.show_alert({message: __('No items found for selected inbound'), indicator: 'yellow'});
            }
        },
        error(r) {
            frappe.show_alert({message: __('Error fetching items'), indicator: 'red'});
            console.error('Error:', r);
        }
    });
}