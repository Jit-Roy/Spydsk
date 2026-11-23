use crate::fast_scanner::get_category_and_color;
use crate::models::{FileNode, TreemapRect};

pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;
    const TB: u64 = 1024 * GB;

    if bytes >= TB {
        format!("{:.2} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub fn generate_treemap(
    nodes: &[FileNode],
    root_id: usize,
    width: f64,
    height: f64,
    max_depth: usize,
) -> Vec<TreemapRect> {
    let mut rects = Vec::new();
    if root_id >= nodes.len() {
        return rects;
    }

    let root = &nodes[root_id];
    if root.size == 0 || root.children.is_empty() {
        return rects;
    }

    // Filter children with non-zero size
    let children_indices: Vec<usize> = root
        .children
        .iter()
        .copied()
        .filter(|&id| id < nodes.len() && nodes[id].size > 0)
        .collect();

    if children_indices.is_empty() {
        return rects;
    }

    let total_size: u64 = children_indices.iter().map(|&id| nodes[id].size).sum();
    if total_size == 0 {
        return rects;
    }

    layout_children(
        nodes,
        &children_indices,
        total_size,
        0.0,
        0.0,
        width,
        height,
        1,
        max_depth,
        &mut rects,
    );

    rects
}

#[allow(clippy::too_many_arguments)]
fn layout_children(
    nodes: &[FileNode],
    children: &[usize],
    total_size: u64,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    current_depth: usize,
    max_depth: usize,
    rects: &mut Vec<TreemapRect>,
) {
    if children.is_empty() || w <= 1.0 || h <= 1.0 || total_size == 0 {
        return;
    }

    // Squarified Treemap Layout (Bruls, Huizing, van Wijk)
    let mut remaining_children = children;
    let mut curr_x = x;
    let mut curr_y = y;
    let mut curr_w = w;
    let mut curr_h = h;
    let mut remaining_size = total_size;

    while !remaining_children.is_empty() && curr_w > 1.0 && curr_h > 1.0 && remaining_size > 0 {
        let is_horizontal = curr_w >= curr_h;
        let side_len = if is_horizontal { curr_h } else { curr_w };

        // Find how many items fit in the current row with optimal aspect ratio
        let mut row_count = 1;
        let mut row_size = nodes[remaining_children[0]].size;
        let mut best_ratio = worst_aspect_ratio(
            &[nodes[remaining_children[0]].size],
            row_size,
            side_len,
            if is_horizontal { curr_w } else { curr_h },
            remaining_size,
        );

        for i in 1..remaining_children.len() {
            let next_size = nodes[remaining_children[i]].size;
            let candidate_row_size = row_size + next_size;
            let candidate_sizes: Vec<u64> = remaining_children[0..=i]
                .iter()
                .map(|&idx| nodes[idx].size)
                .collect();

            let ratio = worst_aspect_ratio(
                &candidate_sizes,
                candidate_row_size,
                side_len,
                if is_horizontal { curr_w } else { curr_h },
                remaining_size,
            );

            if ratio <= best_ratio {
                best_ratio = ratio;
                row_count = i + 1;
                row_size = candidate_row_size;
            } else {
                break;
            }
        }

        // Layout the selected row
        let row_slice = &remaining_children[..row_count];
        let row_fraction = row_size as f64 / remaining_size as f64;

        if is_horizontal {
            let row_width = curr_w * row_fraction;
            let mut item_y = curr_y;

            for &child_id in row_slice {
                let node = &nodes[child_id];
                let item_fraction = if row_size > 0 {
                    node.size as f64 / row_size as f64
                } else {
                    0.0
                };
                let item_height = curr_h * item_fraction;

                let color = if node.is_dir {
                    "#374151".to_string() // Directory background
                } else {
                    let ext = node.extension.as_deref().unwrap_or("");
                    let (_, c) = get_category_and_color(ext);
                    c.to_string()
                };

                rects.push(TreemapRect {
                    id: child_id,
                    name: node.name.clone(),
                    path: node.path.clone(),
                    size: node.size,
                    formatted_size: format_bytes(node.size),
                    is_dir: node.is_dir,
                    extension: node.extension.clone(),
                    color,
                    x: curr_x,
                    y: item_y,
                    w: row_width,
                    h: item_height,
                    depth: current_depth,
                });

                // If folder has children and we haven't reached max depth, recurse into its box
                if node.is_dir
                    && current_depth < max_depth
                    && !node.children.is_empty()
                    && row_width > 12.0
                    && item_height > 12.0
                {
                    let inner_children: Vec<usize> = node
                        .children
                        .iter()
                        .copied()
                        .filter(|&id| id < nodes.len() && nodes[id].size > 0)
                        .collect();
                    let inner_total: u64 = inner_children.iter().map(|&id| nodes[id].size).sum();

                    if inner_total > 0 {
                        layout_children(
                            nodes,
                            &inner_children,
                            inner_total,
                            curr_x + 1.0,
                            item_y + 1.0,
                            row_width - 2.0,
                            item_height - 2.0,
                            current_depth + 1,
                            max_depth,
                            rects,
                        );
                    }
                }

                item_y += item_height;
            }

            curr_x += row_width;
            curr_w -= row_width;
        } else {
            let row_height = curr_h * row_fraction;
            let mut item_x = curr_x;

            for &child_id in row_slice {
                let node = &nodes[child_id];
                let item_fraction = if row_size > 0 {
                    node.size as f64 / row_size as f64
                } else {
                    0.0
                };
                let item_width = curr_w * item_fraction;

                let color = if node.is_dir {
                    "#374151".to_string()
                } else {
                    let ext = node.extension.as_deref().unwrap_or("");
                    let (_, c) = get_category_and_color(ext);
                    c.to_string()
                };

                rects.push(TreemapRect {
                    id: child_id,
                    name: node.name.clone(),
                    path: node.path.clone(),
                    size: node.size,
                    formatted_size: format_bytes(node.size),
                    is_dir: node.is_dir,
                    extension: node.extension.clone(),
                    color,
                    x: item_x,
                    y: curr_y,
                    w: item_width,
                    h: row_height,
                    depth: current_depth,
                });

                if node.is_dir
                    && current_depth < max_depth
                    && !node.children.is_empty()
                    && item_width > 12.0
                    && row_height > 12.0
                {
                    let inner_children: Vec<usize> = node
                        .children
                        .iter()
                        .copied()
                        .filter(|&id| id < nodes.len() && nodes[id].size > 0)
                        .collect();
                    let inner_total: u64 = inner_children.iter().map(|&id| nodes[id].size).sum();

                    if inner_total > 0 {
                        layout_children(
                            nodes,
                            &inner_children,
                            inner_total,
                            item_x + 1.0,
                            curr_y + 1.0,
                            item_width - 2.0,
                            row_height - 2.0,
                            current_depth + 1,
                            max_depth,
                            rects,
                        );
                    }
                }

                item_x += item_width;
            }

            curr_y += row_height;
            curr_h -= row_height;
        }

        remaining_children = &remaining_children[row_count..];
        remaining_size = remaining_size.saturating_sub(row_size);
    }
}

fn worst_aspect_ratio(
    sizes: &[u64],
    row_sum: u64,
    side_len: f64,
    other_dim: f64,
    remaining_total: u64,
) -> f64 {
    if row_sum == 0 || side_len == 0.0 || remaining_total == 0 {
        return f64::MAX;
    }

    let row_thick = other_dim * (row_sum as f64 / remaining_total as f64);
    if row_thick <= 0.0 {
        return f64::MAX;
    }

    let mut worst = 1.0;
    for &s in sizes {
        let item_len = side_len * (s as f64 / row_sum as f64);
        if item_len <= 0.0 {
            continue;
        }
        let ratio = if row_thick > item_len {
            row_thick / item_len
        } else {
            item_len / row_thick
        };
        if ratio > worst {
            worst = ratio;
        }
    }

    worst
}
