// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt

let previous_conversion_rate = 1;

frappe.ui.form.on('Outbound', {
    refresh(frm) {
        previous_conversion_rate = flt(frm.doc.conversion_rate) || 1;
        update_base_total_label(frm); 

        if (frm.doc.docstatus == 0) {
            frm.add_custom_button(__('Get Inbound'), function() {
                get_job_orders(frm);
            });
        }

        if (frm.doc.docstatus == 1) {
            frm.add_custom_button(__('Delivery Note'), function() {
                frappe.new_doc('Logistics Delivery Note', { outbound: frm.doc.name });
            }, __('Create'));
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
        update_base_total_label(frm); 

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
    items_remove(frm) {
        calculate_totals(frm);
    },
});
frappe.ui.form.on("Pallet details", {
    length:     (frm, cdt, cdn) => calculate_cbm_pallet(frm, cdt, cdn),
    width:      (frm, cdt, cdn) => calculate_cbm_pallet(frm, cdt, cdn),
    height:     (frm, cdt, cdn) => calculate_cbm_pallet(frm, cdt, cdn),
    
});
function update_base_total_label(frm) { 
    let inbound_currency = null;
    (frm.doc.items || []).forEach(item => {
        if (item.inbound_currency && item.inbound_currency !== (frm.doc.currency || "AED")) {
            inbound_currency = item.inbound_currency;
        }
    });

    let label = inbound_currency
        ? `Total Value (${inbound_currency})`
        : `Total Value (${frm.doc.currency || "AED"})`;

    if (frm.fields_dict.items && frm.fields_dict.items.grid) {
        frm.fields_dict.items.grid.update_docfield_property('base_total', 'label', __(label));

        if (inbound_currency) {
            frm.fields_dict.items.grid.update_docfield_property('base_total', 'options', inbound_currency);
        }

        frm.fields_dict.items.grid.refresh();
    }
}

function calculate_item_total(frm, cdt, cdn) {
    let row        = locals[cdt][cdn];
    let qty        = flt(row.qty);
    let unit_price = flt(row.unit_price);
    let total      = qty * unit_price;

    frappe.model.set_value(cdt, cdn, 'total_value', total);

    let inbound_unit_price = flt(row.inbound_unit_price);
    let base_total = inbound_unit_price > 0
        ? qty * inbound_unit_price
        : total;

    frappe.model.set_value(cdt, cdn, 'base_total', base_total);

    if (flt(row.unit_wt) > 0) {
        frappe.model.set_value(cdt, cdn, 'gross_wt', flt(row.unit_wt) * qty);
    }

    calculate_totals(frm);
}

function recalculate_all_rows(frm) {
    let new_rate = flt(frm.doc.conversion_rate) || 1;
    let old_rate = flt(previous_conversion_rate) || 1;

    (frm.doc.items || []).forEach(item => {
        let qty = flt(item.qty);

        let unit_price_aed = flt(item.unit_price) * old_rate;
        let unit_price     = unit_price_aed / new_rate;
        let total_value    = qty * unit_price;

        frappe.model.set_value(item.doctype, item.name, 'unit_price',  unit_price);
        frappe.model.set_value(item.doctype, item.name, 'total_value', total_value);
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
function calculate_cbm_pallet(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let l = flt(row.length);
    let w = flt(row.width);
    let h = flt(row.height);
    if (l > 0 && w > 0 && h > 0) {
        row.cbm = (l / 100) * (w / 100) * (h / 100);
    }
    frm.refresh_field("details");
}

function get_job_orders(frm) {
    let selected_names = new Set(); // ✅ Store only names, works across all pages
    let all_fetched_rows = [];      // ✅ Cache all rows from server

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
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'selection_toolbar',
                fieldtype: 'HTML',
                options: `
                    <div id="selection_toolbar" style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 6px 4px;
                        margin-bottom: 4px;
                    ">
                        <button id="btn_select_all" class="btn btn-sm btn-default" style="font-weight:600;">
                            ☐ Select All
                        </button>
                        <button id="btn_deselect_all" class="btn btn-sm btn-default" style="display:none;">
                            ☒ Deselect All
                        </button>
                        <span id="selected_count" style="
                            font-weight: 600;
                            color: #6195ff;
                            font-size: 13px;
                        ">Selected: 0</span>
                        <span id="total_count" style="
                            color: #888;
                            font-size: 12px;
                        "></span>
                    </div>
                `
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
                        fieldname: 'idx',
                        label: __('#'),
                        fieldtype: 'Int',
                        in_list_view: 1,
                        columns: 1,
                        read_only: 1
                    },
                    {
                        fieldname: 'posting_date',
                        label: __('Date'),
                        fieldtype: 'Date',
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: 'name',
                        label: __('Inbound ID'),
                        fieldtype: 'Link',
                        options: 'Inbound',
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: 'customer',
                        label: __('Customer'),
                        fieldtype: 'Link',
                        options: 'Customer',
                        in_list_view: 1,
                        columns: 3
                    },
                    {
                        fieldname: 'total_qty',
                        label: __('Total Qty'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: 'total_value',
                        label: __('Total Value'),
                        fieldtype: 'Currency',
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: 'total_gross_wt',
                        label: __('Total Weight'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        columns: 2
                    }
                ]
            }
        ],
        primary_action_label: __('Get Items'),
        size: 'extra-large',
        primary_action() {
            // ✅ Sync visible page before submitting
            sync_visible_page();

            if (selected_names.size === 0) {
                frappe.show_alert({message: __('Please select at least one inbound'), indicator: 'red'});
                return;
            }

            // ✅ Build selected rows from cached full list
            let selected_rows = all_fetched_rows.filter(r => selected_names.has(r.name));
            fetch_and_add_items(frm, selected_rows, {});
            dialog.hide();
        }
    });

    dialog.set_df_property('job_orders', 'cannot_add_rows', true);

    // ── Helpers ────────────────────────────────────────────────────────────────

    function update_ui() {
        let $count   = dialog.$wrapper.find('#selected_count');
        let $total   = dialog.$wrapper.find('#total_count');
        let $sel     = dialog.$wrapper.find('#btn_select_all');
        let $desel   = dialog.$wrapper.find('#btn_deselect_all');
        let count    = selected_names.size;
        let total    = all_fetched_rows.length;

        $count.text(`Selected: ${count}`);
        $total.text(`of ${total} total`);

        if (count > 0 && count === total) {
            $sel.hide();
            $desel.show();
        } else {
            $sel.show();
            $desel.hide();
        }
    }

    // Sync checkboxes from the currently visible page into selected_names
    function sync_visible_page() {
        let visible = dialog.get_value('job_orders') || [];
        visible.forEach(row => {
            if (row.__checked === 1) {
                selected_names.add(row.name);
            } else {
                selected_names.delete(row.name);
            }
        });
    }

    // Apply selected_names state back onto visible rows
    function apply_selection_to_visible() {
        let visible = dialog.get_value('job_orders') || [];
        visible.forEach(row => {
            row.__checked = selected_names.has(row.name) ? 1 : 0;
        });
        dialog.set_df_property('job_orders', 'data', visible);
        dialog.fields_dict.job_orders.grid.refresh();
    }

    function get_current_filters() {
        let filters = [
            ['docstatus', '=', 1],
            ['status', 'in', ['Pending', 'Partially']]
        ];
        if (dialog.get_value('customer'))  filters.push(['customer',     '=',  dialog.get_value('customer')]);
        if (dialog.get_value('supplier'))  filters.push(['supplier',     '=',  dialog.get_value('supplier')]);
        if (dialog.get_value('job_type'))  filters.push(['job_type',     '=',  dialog.get_value('job_type')]);
        if (dialog.get_value('boe_no'))    filters.push(['boe_no',       '=',  dialog.get_value('boe_no')]);
        if (dialog.get_value('from_date')) filters.push(['posting_date', '>=', dialog.get_value('from_date')]);
        if (dialog.get_value('to_date'))   filters.push(['posting_date', '<=', dialog.get_value('to_date')]);
        return filters;
    }

    function attach_listeners() {
        // ✅ Select All — fetches ALL from server with limit 0
        dialog.$wrapper.find('#btn_select_all').off('click').on('click', function() {
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Inbound',
                    fields: ['name'],
                    filters: get_current_filters(),
                    limit_page_length: 0   // no limit
                },
                callback(r) {
                    (r.message || []).forEach(row => selected_names.add(row.name));
                    apply_selection_to_visible();
                    update_ui();
                }
            });
        });

        // ✅ Deselect All — clears everything
        dialog.$wrapper.find('#btn_deselect_all').off('click').on('click', function() {
            selected_names.clear();
            apply_selection_to_visible();
            update_ui();
        });

        // ✅ Per-row checkbox — sync on click
        dialog.$wrapper.find('.grid-row').off('click.sel').on('click.sel', function() {
            setTimeout(() => {
                sync_visible_page();
                update_ui();
            }, 80);
        });

        // ✅ Frappe's own header checkbox (select all on page) — sync after
        dialog.$wrapper.find('.grid-heading-row input[type="checkbox"]')
            .off('change.sel').on('change.sel', function() {
                setTimeout(() => {
                    sync_visible_page();
                    update_ui();
                }, 80);
            });
    }

    // ── Main fetch ─────────────────────────────────────────────────────────────

    let refresh_job_orders = function() {
        // Save visible page before re-fetching
        sync_visible_page();

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Inbound',
                fields: ['name', 'posting_date', 'customer', 'total_qty', 'total_value', 'total_gross_wt'],
                filters: get_current_filters(),
                limit_page_length: 500
            },
            callback(r) {
                all_fetched_rows = r.message || [];

                // Remove any selected_names no longer in results (filter changed)
                let valid_names = new Set(all_fetched_rows.map(r => r.name));
                for (let n of selected_names) {
                    if (!valid_names.has(n)) selected_names.delete(n);
                }

                let data = all_fetched_rows.map((row, index) => ({
                    ...row,
                    idx: index + 1,
                    __checked: selected_names.has(row.name) ? 1 : 0
                }));

                dialog.set_df_property('job_orders', 'data', data);
                dialog.refresh();

                setTimeout(() => {
                    attach_listeners();
                    update_ui();
                }, 300);
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
            console.log('Fetched items:', r.message);
            if (r.message && r.message.length > 0) {
                let added_count        = 0;
                let zero_balance_count = 0;

                let outbound_currency   = frm.doc.currency || "AED";
                let outbound_conv_rate  = flt(frm.doc.conversion_rate) || 1;
                let is_foreign_outbound = outbound_currency !== "AED";

                r.message.forEach(item => {
                    if (item.balance_qty <= 0) {
                        zero_balance_count++;
                        return;
                    }

                    let child = frm.add_child('items');
                    let qty   = item.balance_qty || 0;

                    let inbound_currency   = item.inbound_currency || "AED";
                    let inbound_conv_rate  = flt(item.inbound_conversion_rate) || 1;
                    let is_foreign_inbound = inbound_currency !== "AED";

                    let unit_price_aed = is_foreign_inbound
                        ? (item.unit_price || 0) * inbound_conv_rate   // USD → AED
                        : (item.unit_price || 0);                      // already AED

                    let unit_price = is_foreign_outbound
                        ? unit_price_aed / outbound_conv_rate          // AED → outbound
                        : unit_price_aed;                              // keep AED

                    let total_value = qty * unit_price;

                    let base_total = qty * (item.unit_price || 0);

                    child.part_no              = item.part_no || '';
                    child.qty                  = qty;
                    child.uom                  = item.uom || '';
                    child.item_code            = item.item_code || '';
                    child.unit_price           = unit_price;
                    child.total_value          = total_value;
                    child.base_total           = base_total;  
                    child.inbound_unit_price   = item.unit_price || 0;         // ✅ original USD value
                    child.inbound_currency     = inbound_currency;     // ✅ store for label
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
                update_base_total_label(frm); 

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