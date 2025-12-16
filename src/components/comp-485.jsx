"use client";;
import {
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleXIcon,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListFilterIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from '../supabase';

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import LoadingScreen from './LoadingScreen';

// Custom filter function for multi-column searching
const multiColumnFilterFn = (row, _columnId, filterValue) => {
  const searchableRowContent =
    `${row.original.name} ${row.original.occupation} ${row.original.role}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

const statusFilterFn = (
  row,
  columnId,
  filterValue,
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId);
  return filterValue.includes(status);
};

const columns = [
  {
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)} />
    ),
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} />
    ),
    id: "select",
    size: 28,
  },
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3 text-left">
        {row.original.avatar_url ? (
          <img src={row.original.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover bg-secondary" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
            {row.getValue("name")?.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.getValue("name")}</span>
          {row.original.email && <span className="text-xs text-muted-foreground">{row.original.email}</span>}
        </div>
      </div>
    ),
    enableHiding: false,
    filterFn: multiColumnFilterFn,
    header: "User",
    size: 200,
  },
  {
    accessorKey: "occupation",
    header: "Occupation",
    size: 180,
  },
  {
    accessorKey: "created_at",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return <div className="text-muted-foreground text-xs">{date.toLocaleDateString()}</div>;
    },
    header: "Joined",
    size: 150,
  },
  {
    accessorKey: "role",
    cell: ({ row }) => (
      <div className="capitalize text-foreground font-medium">{row.getValue("role")}</div>
    ),
    header: "Role",
    size: 120,
  },
  {
    accessorKey: "status",
    cell: ({ row }) => {
      const status = row.getValue("status") || "active";
      return (
        <Badge
          variant="outline"
          className={cn(
            "capitalize border-0 px-2 py-0.5 whitespace-nowrap",
            status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-secondary text-muted-foreground"
          )}
        >
          {status}
        </Badge>
      );
    },
    filterFn: statusFilterFn,
    header: "Status",
    size: 100,
  },

  {
    accessorKey: "credits",
    cell: ({ row }) => {
      const amount = Number(row.getValue("credits") || 0);
      return <div className="font-medium">{amount} Cr</div>;
    },
    header: "Credits",
    size: 100,
  },
  {
    id: "actions",
    cell: ({ row, table }) => <RowActions row={row} table={table} onEdit={(user) => { table.options.meta?.onEdit(user) }} onBan={(id, status) => table.options.meta?.onBan(id, status)} onDelete={(id) => table.options.meta?.onDelete(id)} />,
    enableHiding: false,
    header: () => <span className="sr-only">Actions</span>,
    size: 60,
  },
];

export default function Component() {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const inputRef = useRef(null);

  const [sorting, setSorting] = useState([
    {
      desc: false,
      id: "name",
    },
  ]);

  const [data, setData] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
    // Check dark mode
    if (typeof window !== 'undefined') {
      setDarkMode(document.documentElement.classList.contains('dark'));
    }
  }, []);

  // Real Fetch from Supabase
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // 1. Try RPC Function (Most reliable for Auth/Email access)
      const { data: rpcUsers, error: rpcError } = await supabase.rpc('get_admin_users');

      if (!rpcError && rpcUsers) {
        processUsers(rpcUsers);
        return;
      }

      if (rpcError) console.warn("RPC 'get_admin_users' failed, trying View...", rpcError);

      // 2. Fallback to View
      const { data: users, error } = await supabase
        .from('admin_users_view')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // 3. Fallback to user_details 
        console.warn("View 'admin_users_view' failed, falling back to 'user_details'. Emails might be missing.", error);
        const { data: fallbackUsers, error: fallbackError } = await supabase
          .from('user_details')
          .select('*')
          .order('created_at', { ascending: false });

        if (fallbackError) {
          console.error("Error fetching users:", fallbackError);
          return;
        }
        processUsers(fallbackUsers);
        return;
      }

      processUsers(users);

    } catch (err) {
      console.error("An unexpected error occurred:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const processUsers = (users) => {
    if (users) {
      const transformed = users.map(u => ({
        id: u.id,
        name: u.username,
        username: u.username,
        email: u.email || null,
        occupation: u.occupation || 'N/A',
        role: u.role || 'user',
        status: u.status || 'active',
        credits: u.credits,
        avatar_url: u.avatar_url,
        created_at: u.created_at || new Date().toISOString(),
      }));
      setData(transformed);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateUser = async (updatedData) => {
    try {
      const { error } = await supabase
        .from('user_details')
        .update(updatedData)
        .eq('id', editingUser.id);

      if (error) throw error;

      fetchUsers();
      setIsEditOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const handleBanUser = async (id, currentStatus) => {
    if (id === currentUserId) {
      alert("You cannot ban yourself.");
      return;
    }
    const isBanned = currentStatus === 'banned';
    try {
      const { error } = await supabase
        .from('user_details')
        .update({
          status: isBanned ? 'active' : 'banned',
          role: isBanned ? 'common' : 'banned'
        })
        .eq('id', id);

      if (error) throw error;
      fetchUsers();
    } catch (e) {
      console.error("Error banning user:", e);
    }
  };

  const handleBulkBan = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    let ids = selectedRows.map(r => r.original.id);

    if (ids.includes(currentUserId)) {
      alert("You cannot ban yourself. Your ID will be excluded from this action.");
      ids = ids.filter(id => id !== currentUserId);
    }

    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .from('user_details')
        .update({ status: 'banned', role: 'banned' })
        .in('id', ids);

      if (error) throw error;
      fetchUsers();
      table.resetRowSelection();
    } catch (e) {
      console.error("Error bulk banning", e);
    }
  };

  const handleDeleteUser = async (id) => {
    if (id === currentUserId) {
      alert("You cannot delete your own account.");
      return;
    }
    try {
      const { error } = await supabase
        .from('user_details')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchUsers();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };


  const handleDeleteRows = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    let ids = selectedRows.map(r => r.original.id);

    if (ids.includes(currentUserId)) {
      alert("You cannot delete your own account. Your ID will be excluded from this action.");
      ids = ids.filter(id => id !== currentUserId);
    }

    if (ids.length === 0) return;

    try {
      const { error } = await supabase.from('user_details').delete().in('id', ids);
      if (error) throw error;
      fetchUsers();
      table.resetRowSelection();
    } catch (e) { console.error(e); }
  };

  const table = useReactTable({
    columns,
    data,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility,
      pagination,
      sorting,
    },
    meta: {
      onEdit: (user) => { setEditingUser(user); setIsEditOpen(true); },
      onBan: handleBanUser,
      onDelete: handleDeleteUser
    }
  });

  // Get unique status values
  const uniqueStatusValues = useMemo(() => {
    const statusColumn = table.getColumn("status");

    if (!statusColumn) return [];

    const values = Array.from(statusColumn.getFacetedUniqueValues().keys());

    return values.sort();
  }, [table.getColumn]);

  // Get counts for each status
  const statusCounts = useMemo(() => {
    const statusColumn = table.getColumn("status");
    if (!statusColumn) return new Map();
    return statusColumn.getFacetedUniqueValues();
  }, [table]);

  const selectedStatuses = useMemo(() => {
    const filterValue = table.getColumn("status")?.getFilterValue();
    return filterValue ?? [];
  }, [table]);

  const handleStatusChange = (checked, value) => {
    const filterValue = table.getColumn("status")?.getFilterValue();
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("status")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Filter by name or email */}
          <div className="relative">
            <Input
              aria-label="Search users"
              className={cn(
                "peer min-w-60 ps-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:border-ring",
                Boolean(table.getColumn("name")?.getFilterValue()) && "pe-9"
              )}
              id={`${id}-input`}
              onChange={(e) =>
                table.getColumn("name")?.setFilterValue(e.target.value)
              }
              placeholder="Search users..."
              ref={inputRef}
              type="text"
              value={
                (table.getColumn("name")?.getFilterValue() ?? "")
              } />
            <div
              className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-500 peer-disabled:opacity-50">
              <ListFilterIcon aria-hidden="true" size={16} />
            </div>
            {Boolean(table.getColumn("name")?.getFilterValue()) && (
              <button
                aria-label="Clear filter"
                className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  table.getColumn("name")?.setFilterValue("");
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
                type="button">
                <CircleXIcon aria-hidden="true" size={16} />
              </button>
            )}
          </div>
          {/* Filter by status */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                Status
                {selectedStatuses.length > 0 && (
                  <span
                    className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground/70">
                    {selectedStatuses.length}
                  </span>
                )}
                <ChevronDownIcon className="ml-2 opacity-50" size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-36 p-3">
              <div className="space-y-3">
                <div className="font-medium text-muted-foreground text-xs">
                  Filters
                </div>
                <div className="space-y-3">
                  {uniqueStatusValues.map((value, i) => (
                    <div className="flex items-center gap-2" key={value}>
                      <Checkbox
                        checked={selectedStatuses.includes(value)}
                        id={`${id}-${i}`}
                        onCheckedChange={(checked) =>
                          handleStatusChange(checked, value)
                        } />
                      <Label
                        className="flex grow justify-between gap-2 font-normal"
                        htmlFor={`${id}-${i}`}>
                        {value}{" "}
                        <span className="ms-2 text-muted-foreground text-xs">
                          {statusCounts.get(value)}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {/* Toggle columns visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3Icon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      checked={column.getIsVisible()}
                      className="capitalize"
                      key={column.id}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      onSelect={(event) => event.preventDefault()}>
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          {/* Delete button */}
          {table.getSelectedRowModel().rows.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="ml-auto" variant="outline">
                  <TrashIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Delete
                  <span
                    className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground/70">
                    {table.getSelectedRowModel().rows.length}
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
                  <div
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <CircleAlertIcon className="opacity-80" size={16} />
                  </div>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete{" "}
                      {table.getSelectedRowModel().rows.length} selected{" "}
                      {table.getSelectedRowModel().rows.length === 1
                        ? "row"
                        : "rows"}
                      .
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRows}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {table.getSelectedRowModel().rows.length > 0 && (
            <Button variant="destructive" onClick={handleBulkBan} className="ml-auto">
              <CircleAlertIcon className="mr-2" size={16} />
              Ban Selected
            </Button>
          )}

          {/* Edit User Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit User: {editingUser?.username}</DialogTitle>
                <DialogDescription>Make changes to the user profile here.</DialogDescription>
              </DialogHeader>
              {editingUser && (
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Select defaultValue={editingUser.role?.toLowerCase()} onValueChange={(val) => setEditingUser({ ...editingUser, role: val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administrator">Administrator</SelectItem>
                        <SelectItem value="wealthy">Wealthy</SelectItem>
                        <SelectItem value="freebiee">Freebiee</SelectItem>
                        <SelectItem value="common">Common</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="occupation">Occupation</Label>
                    <Select defaultValue={editingUser.occupation?.toLowerCase()} onValueChange={(val) => setEditingUser({ ...editingUser, occupation: val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select occupation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="worker">Worker</SelectItem>
                        <SelectItem value="freelancer">Freelancer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="credits">Credits</Label>
                    <Input
                      id="credits"
                      type="number"
                      defaultValue={editingUser.credits}
                      disabled
                      className="opacity-60 cursor-not-allowed bg-zinc-900/50"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select defaultValue={editingUser.status} onValueChange={(val) => setEditingUser({ ...editingUser, status: val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button onClick={() => handleUpdateUser({
                  role: editingUser.role,
                  occupation: editingUser.occupation,
                  // Credits are intentionally excluded to prevent editing
                  status: editingUser.status
                })}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* Table */}

      {/* Table */}
      <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm relative", isLoading ? "min-h-[400px]" : "")}>
        {isLoading && <LoadingScreen isGlobal={false} darkMode={darkMode} />}
        <Table className="table-fixed">
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent border-border" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      className={cn("h-11 text-muted-foreground font-medium", header.id === "name" ? "text-left pl-4" : "text-center")}
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(header.column.getCanSort() &&
                            "flex h-full cursor-pointer select-none items-center gap-2 group", header.id === "name" ? "justify-start" : "justify-center")}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            // Enhanced keyboard handling for sorting
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: (
                              <ChevronUpIcon aria-hidden="true" className="shrink-0 opacity-60" size={16} />
                            ),
                            desc: (
                              <ChevronDownIcon aria-hidden="true" className="shrink-0 opacity-60" size={16} />
                            ),
                          }[header.column.getIsSorted()] ?? null}
                        </div>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow data-state={row.getIsSelected() && "selected"} key={row.id} className="border-border hover:bg-muted/50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell className={cn("last:py-0 text-foreground py-3", cell.column.id === "name" ? "text-left pl-4" : "text-center")} key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  {isLoading ? "Loading users..." : "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between gap-8">
        {/* Results per page */}
        <div className="flex items-center gap-3">
          <Label className="max-sm:sr-only" htmlFor={id}>
            Rows per page
          </Label>
          <Select
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
            value={table.getState().pagination.pageSize.toString()}>
            <SelectTrigger className="w-fit whitespace-nowrap" id={id}>
              <SelectValue placeholder="Select number of results" />
            </SelectTrigger>
            <SelectContent
              className="[&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 [&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Page number information */}
        <div
          className="flex grow justify-end whitespace-nowrap text-muted-foreground text-sm">
          <p
            aria-live="polite"
            className="whitespace-nowrap text-muted-foreground text-sm">
            <span className="text-foreground">
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}
              -
              {Math.min(Math.max(table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                table.getState().pagination.pageSize, 0), table.getRowCount())}
            </span>{" "}
            of{" "}
            <span className="text-foreground">
              {table.getRowCount().toString()}
            </span>
          </p>
        </div>

        {/* Pagination buttons */}
        <div>
          <Pagination>
            <PaginationContent>
              {/* First page button */}
              <PaginationItem>
                <Button
                  aria-label="Go to first page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.firstPage()}
                  size="icon"
                  variant="outline">
                  <ChevronFirstIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              {/* Previous page button */}
              <PaginationItem>
                <Button
                  aria-label="Go to previous page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                  size="icon"
                  variant="outline">
                  <ChevronLeftIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              {/* Next page button */}
              <PaginationItem>
                <Button
                  aria-label="Go to next page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                  size="icon"
                  variant="outline">
                  <ChevronRightIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              {/* Last page button */}
              <PaginationItem>
                <Button
                  aria-label="Go to last page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.lastPage()}
                  size="icon"
                  variant="outline">
                  <ChevronLastIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div >
  );
}

function RowActions({ row, table }) {
  const user = row.original;
  const isBanned = user.status === 'banned';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex justify-center">
          <Button
            aria-label="Edit item"
            className="shadow-none"
            size="icon"
            variant="ghost">
            <EllipsisIcon aria-hidden="true" size={16} />
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => table.options.meta?.onEdit(user)}>
            <span>Edit</span>
            <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => table.options.meta?.onBan(user.id, user.status)}>
            <span>{isBanned ? 'Unban User' : 'Ban User'}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => table.options.meta?.onDelete(user.id)}>
          <span>Delete Data</span>
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
