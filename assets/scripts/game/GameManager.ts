import { JsonAsset, Prefab, resources, instantiate, Vec3, Node, utils } from 'cc';
import { Macro } from './Macro';
import { mapRoundItem } from './mapRoundItem';
import { Utils } from '../utils/Utils';

/**
 * 圆圈信息接口
 * 包含圆圈的行列索引和坐标信息
 */
export interface ICircleInfo {
    row: number;    // 行索引
    col: number;    // 列索引
    x: number;      // X坐标
    y: number;      // Y坐标
}

/**
 * 游戏管理器 - 单例模式
 * 负责管理游戏逻辑、关卡数据、地图创建等
 */
export class GameManager {
    private static _instance: GameManager = null;

    // 关卡相关
    private currentLevel: number = 1; // 当前关卡索引，从1开始
    private levelData: any = null; // 关卡数据

    // 地图相关
    private roundItemsArr: mapRoundItem[] = []; // 所有圆圈组件数组
    private gameMapNode: Node = null; // 地图父节点
    private mapRoundItemPre: Prefab = null; // 圆圈预制体
    private allCircles: ICircleInfo[][] = []; // 所有地图有效圆圈信息
    // 存储每个已激活的圆点坐标，key: "row_col"
    private roundItemPositions: Map<string, { x: number, y: number }> = new Map();

    // 箭头路径相关
    private arrowPaths: { x: number, y: number }[][] = []; // 箭头路径数组
    private pathLeftMap: boolean[] = []; // 记录每条路径是否已离开地图，true表示已离开
    // 记录每条路径的头部位置和方向，用于检查是否面对面
    private pathHeadInfo: { row: number, col: number, dir: { x: number, y: number } }[] = [];

    private constructor() {
        // 私有构造函数，防止外部实例化
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): GameManager {
        if (!GameManager._instance) {
            GameManager._instance = new GameManager();
        }
        return GameManager._instance;
    }

    /**
     * 初始化游戏管理器
     * @param gameMapNode 地图父节点
     * @param mapRoundItemPre 圆圈预制体
     */
    public init(gameMapNode: Node, mapRoundItemPre: Prefab): void {
        this.gameMapNode = gameMapNode;
        this.mapRoundItemPre = mapRoundItemPre;
    }
    /**
     * 获取方向向量
     * @param x1 起点X坐标
     * @param y1 起点Y坐标
     * @param x2 终点X坐标(箭头起点)
     * @param y2 终点Y坐标(箭头起点)
     * @returns 方向向量 {x, y}，支持上下左右四个基本方向
     *          {x: 0, y: 1} 向上
     *          {x: 0, y: -1} 向下
     *          {x: 1, y: 0} 向右
     *          {x: -1, y: 0} 向左
     *          {x: 0, y: 0} 无方向（斜向或相同点）
     */
    public getDir(x1: number, y1: number, x2: number, y2: number): { x: number, y: number } {
        // 垂直方向：向上
        if (x2 === x1 && y2 > y1) {
            return Macro.ArrowDirection.Up;
        }
        // 垂直方向：向下
        if (x2 === x1 && y2 < y1) {
            return Macro.ArrowDirection.Down;
        }
        // 水平方向：向右
        if (y2 === y1 && x2 > x1) {
            return Macro.ArrowDirection.Right;
        }
        // 水平方向：向左
        if (y2 === y1 && x2 < x1) {
            return Macro.ArrowDirection.Left;
        }
        // 其他情况（斜向或相同点）
        return Macro.ArrowDirection.None;
    }

    /**
     * 加载并初始化关卡
     * @param level 关卡编号，默认1
     */
    public async loadLevel(level: number = 1): Promise<void> {
        this.currentLevel = level;
        this.roundItemsArr = []; // 清空之前的圆圈数组
        this.roundItemPositions.clear(); // 清空坐标记录

        return new Promise((resolve, reject) => {
            // 加载关卡配置文件
            resources.load('config/arrowLevel', JsonAsset, (err, jsonAsset) => {
                if (err) {
                    console.error('加载关卡配置失败:', err);
                    reject(err);
                    return;
                }

                const configData = jsonAsset.json;
                if (!configData || !configData.levels) {
                    console.error('关卡配置数据格式错误');
                    reject(new Error('关卡配置数据格式错误'));
                    return;
                }

                // 获取当前关卡数据
                const levelInfo = configData.levels.find((l: any) => l.level === this.currentLevel);
                if (!levelInfo) {
                    console.error(`未找到关卡 ${this.currentLevel} 的配置`);
                    reject(new Error(`未找到关卡 ${this.currentLevel} 的配置`));
                    return;
                }
                this.levelData = levelInfo;
                // 根据配置创建地图
                // 优先使用 arrowPaths 矩阵来确定激活的圆圈，如果没有则使用 rowCounts
                if (levelInfo.arrowPaths && Array.isArray(levelInfo.arrowPaths) && levelInfo.arrowPaths.length > 0) {
                    const firstItem = levelInfo.arrowPaths[0];
                    if (Array.isArray(firstItem) && typeof firstItem[0] === 'number') {
                        // 数字矩阵格式，使用它来创建地图
                        this.createMapRoundItemsFromMatrix(levelInfo.arrowPaths);
                    } else if (levelInfo.rowCounts && Array.isArray(levelInfo.rowCounts)) {
                        // 点数组格式，使用 rowCounts
                        this.createMapRoundItemsWithRowCounts(levelInfo.rowCounts.length, levelInfo.rowCounts);
                    }
                } else if (levelInfo.rowCounts && Array.isArray(levelInfo.rowCounts)) {
                    // 没有 arrowPaths，使用 rowCounts
                    this.createMapRoundItemsWithRowCounts(levelInfo.rowCounts.length, levelInfo.rowCounts);
                }
                resolve();
            });
        });
    }
    /**
     * 从 arrowPaths 矩阵创建 mapRoundItem（方形网格布局）
     * 0表示未激活，非0表示已激活
     * @param pathMatrix 路径矩阵，每行是一个数组，数字表示该位置的路径编号（0=未激活）
     */
    private createMapRoundItemsFromMatrix(pathMatrix: number[][]): void {
        if (!this.gameMapNode || !this.mapRoundItemPre) {
            console.error('gameMapNode 或 mapRoundItemPre 未设置');
            return;
        }

        if (!pathMatrix || pathMatrix.length === 0) {
            console.error('路径矩阵为空');
            return;
        }

        const rows = pathMatrix.length;
        const maxCols = Math.max(...pathMatrix.map(row => row ? row.length : 0));
        let totalItems = 0;
        let activeItems = 0;

        // 计算中间行的索引，用于Y坐标居中
        const centerRow = (rows - 1) / 2;

        for (let row = 0; row < rows; row++) {
            const rowData = pathMatrix[row] || [];
            
            // 反转行索引：矩阵的第一行（row=0）对应地图的顶部（实际行索引=rows-1）
            // 这样配置时，矩阵的第一行就是地图的顶部，更直观
            const actualRow = rows - 1 - row;
            
            // 计算当前行的起始X位置（居中）
            const offsetX = -(maxCols - 1) * Macro.mapRoundHorizontalGap / 2;

            for (let col = 0; col < maxCols; col++) {
                //创建N*N格子地图，但是只激活特定格子
                const itemNode = instantiate(this.mapRoundItemPre);

                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                // Y坐标居中：以中间行为0，上下对称分布
                // 使用 actualRow 来计算Y坐标，使矩阵第一行对应地图顶部
                const y = (actualRow - centerRow) * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));
                itemNode.setParent(this.gameMapNode);
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    // 判断当前格子是否激活：0=未激活，非0=已激活（包括负数，绝对值表示路径编号）
                    const pathId = rowData[col];
                    const isInMap = (pathId !== undefined && pathId !== null && pathId !== 0);

                    // 存储时仍然使用矩阵的原始行列索引（row, col），因为路径加载逻辑使用的是矩阵索引
                    mapRoundItemComp.initItem(row, col, x, y, isInMap);
                    this.roundItemsArr.push(mapRoundItemComp);

                    // 只记录激活的格子坐标，key使用矩阵的原始行列索引
                    if (isInMap) {
                        const key = `${row}_${col}`;
                        this.roundItemPositions.set(key, { x, y });
                        activeItems++;
                    }
                }
                totalItems++;
            }
        }
        console.log('从路径矩阵创建地图，roundItemPositions', this.roundItemPositions);
        console.log(`成功创建 ${rows} 行 × ${maxCols} 列的方形网格，共 ${totalItems} 个格子，激活 ${activeItems} 个`);
    }

    /**
     * 根据行数和每行的圆点数量创建 mapRoundItem（方形网格布局）
     * 创建完整的rows×cols网格，但根据rowCounts来激活每行的某些格子
     * @param rows 总行数
     * @param rowCounts 每行的圆点数量数组，表示每行激活的格子数量（从中间开始）
     */
    private createMapRoundItemsWithRowCounts(rows: number, rowCounts: number[]): void {
        if (!this.gameMapNode || !this.mapRoundItemPre) {
            console.error('gameMapNode 或 mapRoundItemPre 未设置');
            return;
        }

        if (rowCounts.length !== rows) {
            console.error(`行数配置错误：总行数 ${rows} 与 rowCounts 数组长度 ${rowCounts.length} 不匹配`);
            return;
        }

        const maxCols = Math.max(...rowCounts);
        let totalItems = 0;
        let activeItems = 0;

        // 计算中间行的索引，用于Y坐标居中
        const centerRow = (rows - 1) / 2;

        for (let row = 0; row < rows; row++) {
            const countInRow = rowCounts[row];

            // 计算当前行的起始X位置（居中）
            const offsetX = -(maxCols - 1) * Macro.mapRoundHorizontalGap / 2;

            for (let col = 0; col < maxCols; col++) {
                //创建N*N格子地图，但是只激活特定格子
                const itemNode = instantiate(this.mapRoundItemPre);

                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                // Y坐标居中：以中间行为0，上下对称分布
                const y = (row - centerRow) * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));
                itemNode.setParent(this.gameMapNode);
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    // 判断当前格子是否在激活区域内
                    const centerCol = Math.floor(maxCols / 2);
                    const leftCount = Math.floor(countInRow / 2);
                    const rightCount = countInRow - leftCount;
                    const startCol = centerCol - leftCount;
                    const endCol = centerCol + rightCount - 1;

                    const isInMap = (col >= startCol && col <= endCol);

                    mapRoundItemComp.initItem(row, col, x, y, isInMap);
                    this.roundItemsArr.push(mapRoundItemComp);

                    // 只记录激活的格子坐标
                    if (isInMap) {
                        const key = `${row}_${col}`;
                        this.roundItemPositions.set(key, { x, y });
                        activeItems++;
                    }
                }
                totalItems++;
            }
        }
        console.log('jay地图有效圆圈roundItemPositions', this.roundItemPositions)
        console.log(`成功创建 ${rows} 行 × ${maxCols} 列的方形网格，共 ${totalItems} 个格子，激活 ${activeItems} 个`);
        console.log(`每行激活的格子数量: [${rowCounts.join(', ')}]`);
    }

    /**
     * 初始化箭头路径
     * 优先从配置文件中读取路径，如果没有配置则自动生成
     * 确保所有圆圈都被路径覆盖
     */
    public initArrowPaths(): void {
        // 清空之前的路径
        this.arrowPaths = [];
        this.pathLeftMap = []; // 清空离开状态数组
        this.pathHeadInfo = []; // 清空路径头部信息
        this.allCircles = []; // 清空圆圈数组

        // 获取所有圆圈的行列信息
        for (const [key, pos] of this.roundItemPositions.entries()) {
            const [row, col] = key.split('_').map(Number);
            if (!this.allCircles[row]) {
                this.allCircles[row] = [];
            }
            this.allCircles[row].push({ row, col, x: pos.x, y: pos.y });
        }

        if (this.allCircles.length === 0) {
            console.warn('没有找到任何圆圈，无法生成路径');
            return;
        }

        // 优先从配置文件中读取路径
        if (this.levelData && this.levelData.arrowPaths && this.levelData.arrowPaths.length) {
            // 检查是数字矩阵格式还是点数组格式
            const firstItem = this.levelData.arrowPaths[0];
            if (Array.isArray(firstItem) && firstItem.length > 0) {
                // 如果是数字（矩阵格式）
                if (typeof firstItem[0] === 'number') {
                    this.loadArrowPathsFromMatrix(this.levelData.arrowPaths, this.allCircles);
                } else {
                    // 如果是对象（点数组格式）
            this.loadArrowPathsFromConfig(this.levelData.arrowPaths, this.allCircles);
                }
            }
        }
        else {
            // 如果没有配置，自动生成路径
            this.generateArrowPathsAutomatically(this.allCircles);
        }
    }

    /**
     * 从数字矩阵格式加载箭头路径
     * 格式：二维数组，数字表示路径编号
     * - 0 = 未激活的圆圈
     * - 正数 = 路径的中间部分（绝对值表示路径编号）
     * - 负数 = 路径的头部/箭头指向的点（绝对值表示路径编号）
     * 例如：[1, 1, 1, -1] 表示路径1，箭头指向右边（-1在右边）
     * @param pathMatrix 路径矩阵，每行是一个数组，数字表示该位置的路径编号
     * @param allCircles 所有圆圈信息
     */
    private loadArrowPathsFromMatrix(
        pathMatrix: number[][],
        allCircles: ICircleInfo[][]
    ): void {
        const coveredCircles = new Set<string>();
        const pathGroups: Map<number, { row: number, col: number, isHead: boolean }[]> = new Map();

        // 遍历矩阵，收集每个路径编号的所有点，并标记头部（负数）
        for (let row = 0; row < pathMatrix.length; row++) {
            const rowData = pathMatrix[row];
            if (!Array.isArray(rowData)) {
                console.warn(`路径矩阵第 ${row} 行格式无效`);
                continue;
            }

            for (let col = 0; col < rowData.length; col++) {
                const pathValue = rowData[col];
                if (pathValue === 0 || pathValue === undefined || pathValue === null) {
                    continue; // 0表示无路径
                }

                // 检查该位置是否存在有效圆圈
                if (!this.hasRoundItem(row, col)) {
                    continue;
                }

                // 使用绝对值作为路径编号，负数表示头部
                const pathId = Math.abs(pathValue);
                const isHead = pathValue < 0;

                // 将点添加到对应的路径组
                if (!pathGroups.has(pathId)) {
                    pathGroups.set(pathId, []);
                }
                pathGroups.get(pathId)!.push({ row, col, isHead });
            }
        }

        // 为每个路径编号生成路径
        const sortedPathIds = Array.from(pathGroups.keys()).sort((a, b) => a - b);
        
        for (const pathId of sortedPathIds) {
            const pointsWithHead = pathGroups.get(pathId)!;
            if (pointsWithHead.length < 2) {
                console.warn(`路径 ${pathId} 的点数量少于2，跳过`);
                continue;
            }

            // 分离头部点和普通点
            const headPoints: { row: number, col: number }[] = [];
            const normalPoints: { row: number, col: number }[] = [];
            
            for (const point of pointsWithHead) {
                const pointData = { row: point.row, col: point.col };
                if (point.isHead) {
                    headPoints.push(pointData);
                } else {
                    normalPoints.push(pointData);
                }
            }

            // 将所有点合并（头部点优先放在前面，用于确定方向）
            const allPoints = [...headPoints, ...normalPoints];
            
            // 将点按顺序连接成路径（使用BFS或简单连接）
            let path = this.connectPointsToPath(
                allPoints.map(p => ({ row: p.row, col: p.col })), 
                coveredCircles
            );
            
            if (path && path.length >= 2) {
                // 根据头部位置调整路径方向
                if (headPoints.length > 0) {
                    path = this.adjustPathDirectionByHead(path, headPoints, pathMatrix);
                }
                
                this.arrowPaths.push(path);
                this.pathLeftMap.push(false);
                
                // 标记路径上的所有圆圈为已覆盖
                for (const point of allPoints) {
                    const circleKey = `${point.row}_${point.col}`;
                    coveredCircles.add(circleKey);
                }
            }
        }

        console.log(`从矩阵格式加载了 ${this.arrowPaths.length} 条路径`);
    }

    /**
     * 根据头部位置调整路径方向
     * @param path 路径坐标数组（反向存储：从尾部到头部）
     * @param headPoints 头部点数组（负数位置）
     * @param pathMatrix 原始路径矩阵
     * @returns 调整后的路径（反向存储：从尾部到头部）
     */
    private adjustPathDirectionByHead(
        path: { x: number, y: number }[],
        headPoints: { row: number, col: number }[],
        pathMatrix: number[][]
    ): { x: number, y: number }[] {
        if (path.length < 2 || headPoints.length === 0) {
            return path;
        }

        // 找到路径中对应的头部坐标
        const headCoords: { x: number, y: number }[] = [];
        for (const headPoint of headPoints) {
            const pos = this.getRoundItemPosition(headPoint.row, headPoint.col);
            if (pos) {
                headCoords.push(pos);
            }
        }

        if (headCoords.length === 0) {
            return path;
        }

        // 路径当前是反向存储的（从尾部到头部），所以 path[0] 是头部，path[path.length-1] 是尾部
        const currentHead = path[0];
        const currentTail = path[path.length - 1];

        // 检查当前头部是否是配置的头部
        let isHeadAtCurrentPosition = false;
        let headCoord: { x: number, y: number } | null = null;
        for (const hc of headCoords) {
            if (Math.abs(hc.x - currentHead.x) < 0.1 && Math.abs(hc.y - currentHead.y) < 0.1) {
                isHeadAtCurrentPosition = true;
                headCoord = hc;
                break;
            }
        }

        // 如果头部在当前位置，检查方向是否正确
        if (isHeadAtCurrentPosition && headCoord) {
            // 找到头部点相邻的正数点，确定箭头应该指向的方向
            const headPoint = headPoints[0];
            const headValue = pathMatrix[headPoint.row][headPoint.col];
            const pathId = Math.abs(headValue);

            // 检查四个方向的相邻点
            const directions = [
                { row: headPoint.row + 1, col: headPoint.col, dir: Macro.ArrowDirection.Up },
                { row: headPoint.row - 1, col: headPoint.col, dir: Macro.ArrowDirection.Down },
                { row: headPoint.row, col: headPoint.col - 1, dir: Macro.ArrowDirection.Left },
                { row: headPoint.row, col: headPoint.col + 1, dir: Macro.ArrowDirection.Right }
            ];

            // 找到相邻的正数点（同一路径）
            for (const dirInfo of directions) {
                if (dirInfo.row >= 0 && dirInfo.row < pathMatrix.length) {
                    const rowData = pathMatrix[dirInfo.row];
                    if (rowData && dirInfo.col >= 0 && dirInfo.col < rowData.length) {
                        const adjacentValue = rowData[dirInfo.col];
                        // 如果相邻位置是同一个路径的正数，说明箭头应该指向这个方向
                        if (Math.abs(adjacentValue) === pathId && adjacentValue > 0) {
                            // 获取相邻点的坐标
                            const adjacentPos = this.getRoundItemPosition(dirInfo.row, dirInfo.col);
                            if (adjacentPos && path.length >= 2) {
                                // 检查当前路径的第一个线段方向（从 path[1] 指向 path[0]）
                                const firstSegDir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
                                // 期望的方向是从相邻点指向头部点
                                const expectedDir = this.getDir(adjacentPos.x, adjacentPos.y, headCoord!.x, headCoord!.y);
                                
                                if (firstSegDir.x === expectedDir.x && firstSegDir.y === expectedDir.y) {
                                    // 方向正确，不需要调整
                                    return path;
                                } else {
                                    // 方向不对，需要反转路径
                                    return path.reverse();
                                }
                            }
                        }
                    }
                }
            }
        }

        // 如果头部不在当前位置，检查尾部是否是头部
        let isHeadAtTail = false;
        for (const headCoord of headCoords) {
            if (Math.abs(headCoord.x - currentTail.x) < 0.1 && Math.abs(headCoord.y - currentTail.y) < 0.1) {
                isHeadAtTail = true;
                break;
            }
        }

        if (isHeadAtTail) {
            // 头部在尾部，需要反转路径
            return path.reverse();
        }

        // 如果头部不在路径的两端，尝试找到头部在路径中的位置
        for (let i = 0; i < path.length; i++) {
            for (const headCoord of headCoords) {
                if (Math.abs(headCoord.x - path[i].x) < 0.1 && Math.abs(headCoord.y - path[i].y) < 0.1) {
                    // 找到头部位置
                    if (i === 0) {
                        // 头部已经在正确位置
                        return path;
                    } else {
                        // 头部不在路径头部，需要反转
                        return path.reverse();
                    }
                }
            }
        }

        // 如果找不到头部，返回原路径
        console.warn(`无法找到路径头部位置，保持原路径`);
        return path;
    }


    /**
     * 将点数组连接成路径（按相邻关系连接，使用BFS确保路径连续）
     * @param points 点数组
     * @param coveredCircles 已覆盖的圆圈集合（用于检查冲突）
     * @returns 路径坐标数组（反向存储：从尾部到头部）
     */
    private connectPointsToPath(
        points: { row: number, col: number }[],
        coveredCircles: Set<string>
    ): { x: number, y: number }[] | null {
        if (points.length < 2) {
            return null;
        }

        // 使用BFS从第一个点开始，连接所有点
        const visited = new Set<string>();
        const path: { row: number, col: number }[] = [];
        const pointsSet = new Set<string>();
        
        for (const point of points) {
            pointsSet.add(`${point.row}_${point.col}`);
        }

        // 从第一个点开始BFS
        const startPoint = points[0];
        const queue: { row: number, col: number, path: { row: number, col: number }[] }[] = [];
        queue.push({ row: startPoint.row, col: startPoint.col, path: [startPoint] });
        visited.add(`${startPoint.row}_${startPoint.col}`);

        while (queue.length > 0) {
            const { row, col, path: currentPath } = queue.shift()!;

            // 如果当前路径包含了所有点，返回路径
            if (currentPath.length === points.length) {
                // 转换为坐标路径
                const coordinatePath: { x: number, y: number }[] = [];
                for (const point of currentPath) {
                    const pos = this.getRoundItemPosition(point.row, point.col);
                    if (pos) {
                        coordinatePath.push(pos);
                    }
                }

                if (coordinatePath.length >= 2) {
                    // 验证路径方向（只能上下左右）
                    let isValid = true;
                    for (let i = 0; i < coordinatePath.length - 1; i++) {
                        const dir = this.getDir(
                            coordinatePath[i + 1].x, 
                            coordinatePath[i + 1].y, 
                            coordinatePath[i].x, 
                            coordinatePath[i].y
                        );
                        if (dir.x === 0 && dir.y === 0) {
                            isValid = false;
                            break;
                        }
                    }

                    if (isValid) {
                        // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
                        return coordinatePath.reverse();
                    }
                }
            }

            // 查找相邻的未访问点（在points集合中）
            const directions = [
                { row: row + 1, col: col },
                { row: row - 1, col: col },
                { row: row, col: col - 1 },
                { row: row, col: col + 1 }
            ];

            for (const dir of directions) {
                const dirKey = `${dir.row}_${dir.col}`;
                if (visited.has(dirKey)) {
                    continue;
                }

                // 检查是否在points集合中，且该位置存在有效圆圈
                if (pointsSet.has(dirKey) && this.hasRoundItem(dir.row, dir.col)) {
                    visited.add(dirKey);
                    queue.push({ 
                        row: dir.row, 
                        col: dir.col, 
                        path: [...currentPath, { row: dir.row, col: dir.col }] 
                    });
                }
            }
        }

        // 如果BFS失败，尝试简单的贪心连接
        return this.greedyConnectPoints(points);
    }

    /**
     * 贪心连接点（简单方法，按距离连接）
     * @param points 点数组
     * @returns 路径坐标数组（反向存储：从尾部到头部）
     */
    private greedyConnectPoints(
        points: { row: number, col: number }[]
    ): { x: number, y: number }[] | null {
        if (points.length < 2) {
            return null;
        }

        const visited = new Set<string>();
        const path: { row: number, col: number }[] = [];
        
        // 从第一个点开始
        let currentPoint = points[0];
        path.push(currentPoint);
        visited.add(`${currentPoint.row}_${currentPoint.col}`);

        // 贪心连接：每次找最近的相邻点
        while (path.length < points.length) {
            let nearestPoint: { row: number, col: number } | null = null;
            let minDistance = Infinity;

            for (const point of points) {
                const pointKey = `${point.row}_${point.col}`;
                if (visited.has(pointKey)) {
                    continue;
                }

                // 计算曼哈顿距离
                const distance = Math.abs(point.row - currentPoint.row) + Math.abs(point.col - currentPoint.col);
                if (distance === 1) { // 相邻
                    nearestPoint = point;
                    break; // 找到相邻点就立即使用
                } else if (distance < minDistance) {
                    minDistance = distance;
                    nearestPoint = point;
                }
            }

            if (!nearestPoint) {
                break; // 没有更多可连接的点
            }

            // 如果点不相邻，尝试找到中间路径
            if (minDistance > 1) {
                const intermediatePath = this.findPathBetweenPoints(currentPoint, nearestPoint, points, visited);
                if (intermediatePath && intermediatePath.length > 1) {
                    // 添加中间路径的点（不包括最后一个，因为那就是nearestPoint）
                    for (let i = 1; i < intermediatePath.length - 1; i++) {
                        const midPoint = intermediatePath[i];
                        const midKey = `${midPoint.row}_${midPoint.col}`;
                        if (!visited.has(midKey)) {
                            path.push(midPoint);
                            visited.add(midKey);
                        }
                    }
                }
            }

            const nearestKey = `${nearestPoint.row}_${nearestPoint.col}`;
            path.push(nearestPoint);
            visited.add(nearestKey);
            currentPoint = nearestPoint;
        }

        // 转换为坐标路径
        const coordinatePath: { x: number, y: number }[] = [];
        for (const point of path) {
            const pos = this.getRoundItemPosition(point.row, point.col);
            if (pos) {
                coordinatePath.push(pos);
            }
        }

        if (coordinatePath.length < 2) {
            return null;
        }

        // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
        return coordinatePath.reverse();
    }

    /**
     * 在两个点之间找到路径（使用BFS）
     * @param start 起点
     * @param end 终点
     * @param availablePoints 可用的点集合
     * @param visited 已访问的点集合
     * @returns 路径点数组
     */
    private findPathBetweenPoints(
        start: { row: number, col: number },
        end: { row: number, col: number },
        availablePoints: { row: number, col: number }[],
        visited: Set<string>
    ): { row: number, col: number }[] | null {
        const availableSet = new Set<string>();
        for (const point of availablePoints) {
            const key = `${point.row}_${point.col}`;
            if (!visited.has(key)) {
                availableSet.add(key);
            }
        }

        const queue: { row: number, col: number, path: { row: number, col: number }[] }[] = [];
        const bfsVisited = new Set<string>();
        
        queue.push({ row: start.row, col: start.col, path: [start] });
        bfsVisited.add(`${start.row}_${start.col}`);

        while (queue.length > 0) {
            const { row, col, path } = queue.shift()!;

            if (row === end.row && col === end.col) {
                return path;
            }

            // 查找相邻点
            const directions = [
                { row: row + 1, col: col },
                { row: row - 1, col: col },
                { row: row, col: col - 1 },
                { row: row, col: col + 1 }
            ];

            for (const dir of directions) {
                const dirKey = `${dir.row}_${dir.col}`;
                if (bfsVisited.has(dirKey)) {
                    continue;
                }

                // 检查是否在可用点集合中，或者是终点
                if (availableSet.has(dirKey) || (dir.row === end.row && dir.col === end.col)) {
                    bfsVisited.add(dirKey);
                    // 检查该位置是否存在有效圆圈
                    if (this.hasRoundItem(dir.row, dir.col)) {
                        queue.push({ row: dir.row, col: dir.col, path: [...path, dir] });
                    }
                }
            }
        }

        return null;
    }

    /**
     * 从配置文件中加载箭头路径（旧格式：点数组）
     * @param configPaths 配置文件中的路径数组，每条路径是 {row, col} 数组
     * @param allCircles 所有圆圈信息
     */
    private loadArrowPathsFromConfig(
        configPaths: { row: number, col: number }[][],
        allCircles: ICircleInfo[][]
    ): void {
        const coveredCircles = new Set<string>();
        const invalidPaths: number[] = [];

        // 遍历配置中的每条路径
        for (let pathIdx = 0; pathIdx < configPaths.length; pathIdx++) {
            const configPath = configPaths[pathIdx];

            if (!Array.isArray(configPath) || configPath.length < 2) {
                console.warn(`路径 ${pathIdx} 配置无效，至少需要2个点`);
                invalidPaths.push(pathIdx);
                continue;
            }

            // 将配置中的 {row, col} 转换为坐标路径
            const path: { x: number, y: number }[] = [];
            let isValid = true;

            for (const point of configPath) {
                if (point.row === undefined || point.col === undefined) {
                    console.warn(`路径 ${pathIdx} 中的点配置无效，缺少 row 或 col`);
                    isValid = false;
                    break;
                }

                const pos = this.getRoundItemPosition(point.row, point.col);
                if (!pos) {
                    console.warn(`路径 ${pathIdx} 中的点 (${point.row}, ${point.col}) 不存在于地图中`);
                    isValid = false;
                    break;
                }

                path.push({ x: pos.x, y: pos.y });
            }

            if (!isValid || path.length < 2) {
                invalidPaths.push(pathIdx);
                continue;
            }

            // 验证路径方向（只能上下左右）
            let pathValid = true;
            for (let i = 0; i < path.length - 1; i++) {
                const dir = this.getDir(path[i + 1].x, path[i + 1].y, path[i].x, path[i].y);
                if (dir.x === 0 && dir.y === 0) {
                    console.warn(`路径 ${pathIdx} 的第 ${i} 段是斜线或无效方向`);
                    pathValid = false;
                    break;
                }
            }

            if (!pathValid) {
                invalidPaths.push(pathIdx);
                continue;
            }

            // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
            this.arrowPaths.push(path.reverse());
            this.pathLeftMap.push(false);

            // 标记路径上的所有圆圈为已覆盖
            for (const point of configPath) {
                const circleKey = `${point.row}_${point.col}`;
                coveredCircles.add(circleKey);
            }
        }

        if (invalidPaths.length > 0) {
            console.warn(`有 ${invalidPaths.length} 条路径配置无效，已跳过`);
        }
    }
    /**
     * 自动生成箭头路径（当配置文件中没有路径配置时使用）
     * 使用BFS从中心向外遍历，确保所有节点都被覆盖
     * @param allCircles 所有圆圈信息（二维数组，按行组织）
     */
    private generateArrowPathsAutomatically(
        allCircles: ICircleInfo[][]
    ): void {
        const coveredCircles = new Set<string>();
        
        // 1. 找到中心节点（最接近地图中心的节点）
        const centerCircle = this.findCenterCircle(allCircles);
        if (!centerCircle) {
            console.warn('无法找到中心节点');
            return;
        }

        // 2. 使用BFS从中心开始，按距离排序所有节点
        const sortedCircles = this.bfsFromCenter(centerCircle, allCircles);
        console.log(`从中心节点 (${centerCircle.row}, ${centerCircle.col}) 开始，共找到 ${sortedCircles.length} 个节点`);

        // 3. 按距离从近到远遍历，为每个未覆盖的节点生成路径
        for (const circle of sortedCircles) {
                const circleKey = `${circle.row}_${circle.col}`;

                if (coveredCircles.has(circleKey)) {
                    continue;
                }

            // 尝试生成路径，优先连接未覆盖的相邻节点
            const path = this.generatePathFromCircleOptimized(circle.row, circle.col, coveredCircles);

                if (path && path.length >= 2) {
                    this.arrowPaths.push(path);
                    this.pathLeftMap.push(false);

                    // 标记路径上的所有圆圈为已覆盖
                this.markPathAsCovered(path, coveredCircles);
            }
        }

        // 验证所有节点是否都被覆盖
        this.validateAllCirclesCovered(allCircles, coveredCircles);
        console.log(`路径生成完成，共生成 ${this.arrowPaths.length} 条路径，覆盖 ${coveredCircles.size} 个节点`);
    }

    /**
     * 找到最接近地图中心的节点
     * @param allCircles 所有圆圈信息
     * @returns 中心节点，如果不存在则返回null
     */
    private findCenterCircle(allCircles: ICircleInfo[][]): ICircleInfo | null {
        if (allCircles.length === 0) {
            return null;
        }

        // 计算所有节点的平均位置（中心点）
        let totalX = 0;
        let totalY = 0;
        let count = 0;

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                totalX += circle.x;
                totalY += circle.y;
                count++;
            }
        }

        if (count === 0) {
            return null;
        }

        const centerX = totalX / count;
        const centerY = totalY / count;

        // 找到距离中心最近的节点
        let minDistance = Infinity;
        let centerCircle: ICircleInfo | null = null;

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                const distance = Math.sqrt(
                    Math.pow(circle.x - centerX, 2) + Math.pow(circle.y - centerY, 2)
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    centerCircle = circle;
                }
            }
        }

        return centerCircle;
    }

    /**
     * 使用BFS从中心节点开始遍历，返回按距离排序的所有节点
     * @param centerCircle 中心节点
     * @param allCircles 所有圆圈信息
     * @returns 按距离从近到远排序的节点数组
     */
    private bfsFromCenter(
        centerCircle: ICircleInfo,
        allCircles: ICircleInfo[][]
    ): ICircleInfo[] {
        const visited = new Set<string>();
        const queue: { circle: ICircleInfo, distance: number }[] = [];
        const result: ICircleInfo[] = [];

        // 将中心节点加入队列
        const centerKey = `${centerCircle.row}_${centerCircle.col}`;
        queue.push({ circle: centerCircle, distance: 0 });
        visited.add(centerKey);

        // BFS遍历
        while (queue.length > 0) {
            const { circle, distance } = queue.shift()!;
            result.push(circle);

            // 查找相邻节点
            const adjacentCircles = this.findAdjacentCirclesByRowCol(circle.row, circle.col);

            for (const adj of adjacentCircles) {
                const adjKey = `${adj.row}_${adj.col}`;
                if (!visited.has(adjKey)) {
                    visited.add(adjKey);
                    // 找到对应的完整节点信息
                    const adjCircle = this.getCircleByRowCol(adj.row, adj.col, allCircles);
                    if (adjCircle) {
                        queue.push({ circle: adjCircle, distance: distance + 1 });
                    }
                }
            }
        }

        return result;
    }

    /**
     * 根据行列获取圆圈信息
     * @param row 行索引
     * @param col 列索引
     * @param allCircles 所有圆圈信息
     * @returns 圆圈信息，如果不存在则返回null
     */
    private getCircleByRowCol(
        row: number,
        col: number,
        allCircles: ICircleInfo[][]
    ): ICircleInfo | null {
        if (allCircles[row]) {
            for (const circle of allCircles[row]) {
                if (circle.row === row && circle.col === col) {
                    return circle;
                }
            }
        }
        return null;
    }

    /**
     * 从指定圆圈生成一条路径（优化版，优先连接未覆盖的相邻节点）
     * @param startRow 起始行
     * @param startCol 起始列
     * @param coveredCircles 已覆盖的圆圈集合
     * @returns 生成的路径点数组（反向存储：从尾部到头部）
     */
    private generatePathFromCircleOptimized(
            startRow: number,
            startCol: number,
            coveredCircles: Set<string>
        ): { x: number, y: number }[] | null {
        const path: { x: number, y: number }[] = [];
        const visited = new Set<string>();
        let currentRow = startRow;
        let currentCol = startCol;
        const startKey = `${currentRow}_${currentCol}`;

        // 检查起始点是否存在
        const startPos = this.getRoundItemPosition(currentRow, currentCol);
        if (!startPos) {
            return null;
        }

        path.push({ x: startPos.x, y: startPos.y });
        visited.add(startKey);

        // 尝试延伸路径，优先连接未覆盖的节点
        // 路径长度范围：3-7个圆圈，但优先确保覆盖未覆盖的节点
        const minLength = Utils.getRandomInt(2, 3);
        const maxLength = Utils.getRandomInt(4, 7);

        while (path.length < maxLength) {
            // 查找当前点的相邻圆圈（上下左右方向）
            const adjacentCircles = this.findAdjacentCirclesByRowCol(currentRow, currentCol);

            // 未覆盖的相邻节点和已覆盖的相邻节点
            const uncoveredCircles: { row: number, col: number }[] = [];

            for (const circle of adjacentCircles) {
                const circleKey = `${circle.row}_${circle.col}`;
                if (visited.has(circleKey)) {
                    continue; 
                }
                if (coveredCircles.has(circleKey)) {
                    continue; 
                } else {
                    uncoveredCircles.push(circle);
                }
            }
            let nextCircle: { row: number, col: number } | null = null;

            if (uncoveredCircles.length > 0) {
                // 如果有未覆盖的节点，优先选择（随机选择以增加路径多样性）
                nextCircle = uncoveredCircles[Utils.getRandomInt(0, uncoveredCircles.length - 1)];
            } else {
                // 没有可用的相邻圆圈，停止延伸
                break;
            }

            if (nextCircle) {
            const nextKey = `${nextCircle.row}_${nextCircle.col}`;
            const nextPos = this.getRoundItemPosition(nextCircle.row, nextCircle.col);

            if (nextPos) {
                path.push({ x: nextPos.x, y: nextPos.y });
                visited.add(nextKey);
                currentRow = nextCircle.row;
                currentCol = nextCircle.col;
            } else {
                    break;
                }
            } else {
                break;
            }

            // 如果路径长度达到最小值且没有未覆盖的相邻节点，可以提前结束
            if (path.length >= minLength && uncoveredCircles.length === 0) {
                break;
            }
        }

        // 如果路径长度小于2，返回null
        if (path.length < 2) {
            return null;
        }

        // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
        return path.reverse();
    }

    /**
     * 标记路径上的所有圆圈为已覆盖
     * @param path 路径点数组
     * @param coveredCircles 已覆盖的圆圈集合
     */
    private markPathAsCovered(
        path: { x: number, y: number }[],
        coveredCircles: Set<string>
    ): void {
        for (const point of path) {
            for (const [key, pos] of this.roundItemPositions.entries()) {
                if (Math.abs(pos.x - point.x) < 0.1 && Math.abs(pos.y - point.y) < 0.1) {
                    coveredCircles.add(key);
                    break;
                }
            }
        }
    }

    /**
     * 验证所有圆圈是否都被路径覆盖
     * @param allCircles 所有圆圈信息
     * @param coveredCircles 已覆盖的圆圈集合
     */
    private validateAllCirclesCovered(
        allCircles: ICircleInfo[][],
        coveredCircles: Set<string>
    ): void {
        const uncoveredCircles: ICircleInfo[] = [];

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                const circleKey = `${circle.row}_${circle.col}`;
                if (!coveredCircles.has(circleKey)) {
                    uncoveredCircles.push(circle);
                }
            }
        }

        if (uncoveredCircles.length > 0) {
            console.warn(`警告：有 ${uncoveredCircles.length} 个圆圈未被路径覆盖：`);
            for (const circle of uncoveredCircles) {
                console.warn(`  未覆盖节点: (${circle.row}, ${circle.col})`);
            }
        } else {
            console.log('✓ 所有圆圈都已被路径覆盖');
        }
    }
    /**
     * 根据行列查找相邻的圆圈（上下左右方向）
     * @param row 当前行
     * @param col 当前列
     * @returns 相邻圆圈的行列信息数组
     */
    private findAdjacentCirclesByRowCol(row: number, col: number): { row: number, col: number }[] {
        const adjacent: { row: number, col: number }[] = [];

        // 方形网格布局：直接通过row±1, col±1查找相邻格子
        const directions = [
            { row: row + 1, col: col },     // 上
            { row: row - 1, col: col },     // 下
            { row: row, col: col - 1 },     // 左
            { row: row, col: col + 1 }      // 右
        ];

        for (const dir of directions) {
            // 检查该位置是否存在且是激活的格子
            if (this.hasRoundItem(dir.row, dir.col)) {
                // 进一步检查该格子是否在map中（isInMap）
                const item = this.getRoundItemByRowCol(dir.row, dir.col);
                if (item && item.isInMap) {
                    adjacent.push({ row: dir.row, col: dir.col });
                }
            }
        }

        return adjacent;
    }

    /**
     * 根据行列获取圆点组件
     * @param row 行索引
     * @param col 列索引
     * @returns 圆点组件，如果不存在则返回null
     */
    private getRoundItemByRowCol(row: number, col: number): mapRoundItem | null {
        for (const item of this.roundItemsArr) {
            if (item.RoundIndex === row && item.ColMunIndex === col) {
                return item;
            }
        }
        return null;
    }
    /**
     * 箭头移动方法
     * @param speed 移动速度
     * @param pathIdx 路径索引
     */
    arrowPathMove(speed: number = 5, pathIdx: number): void {
        if (this.pathLeftMap[pathIdx]) {
            // 如果路径已经离开地图，不再移动
            return;
        }

        if (this.arrowPaths[pathIdx] && this.arrowPaths[pathIdx].length > 1) {
            let curPath = this.arrowPaths[pathIdx];
            //处理头部方向移动
            let dir = this.getDir(curPath[1].x, curPath[1].y, curPath[0].x, curPath[0].y);
            curPath[0].x += dir.x * speed;
            curPath[0].y += dir.y * speed;
            //再处理尾部移动
            let lastIdx = this.arrowPaths[pathIdx].length - 1;
            dir = this.getDir(curPath[lastIdx].x, curPath[lastIdx].y, curPath[lastIdx - 1].x, curPath[lastIdx - 1].y);
            curPath[lastIdx].x += dir.x * speed;
            curPath[lastIdx].y += dir.y * speed;
            if (curPath[lastIdx].x == curPath[lastIdx - 1].x && curPath[lastIdx].y == curPath[lastIdx - 1].y) {
                this.arrowPaths[pathIdx].pop();//删除尾部
            }
        }
        // 检查路径是否已离开地图
        const path = this.arrowPaths[pathIdx];
        let shouldLeave = false;

        if (!path || path.length <= 1) {
            shouldLeave = true;
        } else if (path.length === 2) {
            // 路径长度为2时，根据移动方向检查是否超出边界值
            const headX = path[0].x;
            const headY = path[0].y;

            // 获取路径的移动方向（从第二个点指向第一个点，即头部方向）
            const dir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
            if (dir.x > 0) {
                if (headX >= Macro.pathLeaveBoundary.maxX) {
                    shouldLeave = true;
                }
            } else if (dir.x < 0) {
                if (headX <= Macro.pathLeaveBoundary.minX) {
                    shouldLeave = true;
                }
            } else if (dir.y > 0) {
                if (headY >= Macro.pathLeaveBoundary.maxY) {
                    shouldLeave = true;
                }
            } else if (dir.y < 0) {
                if (headY <= Macro.pathLeaveBoundary.minY) {
                    shouldLeave = true;
                }
            } else {
                const isHeadOnMap = this.hasRoundItemByPosition(headX, headY);
                if (!isHeadOnMap) {
                    shouldLeave = true;
                }
            }
        }

        if (shouldLeave) {
            console.log(`路径${pathIdx}已经离开地图，清空路径`);
            // 清空路径数组，确保不再绘制任何点
            this.arrowPaths[pathIdx] = [];
            // 标记为已离开地图
            this.pathLeftMap[pathIdx] = true;
        }
    }
    /**
     * 检查点击位置是否在路径上
     * @param x 点击X坐标
     * @param y 点击Y坐标
     * @param hitDistance 点击容差距离，默认20
     * @returns 点击到的路径索引，如果没有点击到则返回-1
     */
    public checkPathHit(x: number, y: number, hitDistance: number = 10): number {
        for (let pathIdx = 0; pathIdx < this.arrowPaths.length; pathIdx++) {
            if (this.pathLeftMap[pathIdx]) {
                continue; // 已离开的路径不响应点击
            }

            const path = this.arrowPaths[pathIdx];
            if (!path || path.length < 2) {
                continue;
            }
            // 检查点击位置是否在路径的任意线段上
            for (let i = 0; i < path.length - 1; i++) {
                const startX = path[i + 1].x;
                const startY = path[i + 1].y;
                const endX = path[i].x;
                const endY = path[i].y;

                // 计算点到线段的距离
                const distance = this.pointToLineDistance(x, y, startX, startY, endX, endY);
                if (distance <= hitDistance) {
                    return pathIdx;
                }
            }
        }
        return -1; // 没有点击到任何路径
    }
    /**方向在同一行或者同一列是否面对面有冲突 */
    private arrowDirIsConflict(dir1: { x: number, y: number }, dir2: { x: number, y: number }): boolean {
        if (dir1.x * dir2.x == -1) {
            return true;
        }
        if (dir1.y * dir2.y == -1) {
            return true;
        }
        return false;
    }
    /**
     * 计算点到线段的距离
     * @param px 点X坐标
     * @param py 点Y坐标
     * @param x1 线段起点X
     * @param y1 线段起点Y
     * @param x2 线段终点X
     * @param y2 线段终点Y
     * @returns 距离
     */
    private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 获取当前关卡数据
     */
    public getLevelData(): any {
        return this.levelData;
    }

    /**
     * 获取当前关卡编号
     */
    public getCurrentLevel(): number {
        return this.currentLevel;
    }

    /**
     * 获取所有圆圈组件数组
     */
    public getRoundItems(): mapRoundItem[] {
        return this.roundItemsArr;
    }

    /**
     * 根据行和列获取圆点的坐标
     * @param row 行索引
     * @param col 列索引
     * @returns 坐标对象 {x, y}，如果不存在则返回 null
     */
    public getRoundItemPosition(row: number, col: number): { x: number, y: number } | null {
        const key = `${row}_${col}`;
        const position = this.roundItemPositions.get(key);
        return position || null;
    }

    /**
     * 根据行和列获取圆点的X坐标
     * @param row 行索引
     * @param col 列索引
     * @returns X坐标，如果不存在则返回 null
     */
    public getRoundItemX(row: number, col: number): number | null {
        const position = this.getRoundItemPosition(row, col);
        return position ? position.x : null;
    }

    /**
     * 根据行和列获取圆点的Y坐标
     * @param row 行索引
     * @param col 列索引
     * @returns Y坐标，如果不存在则返回 null
     */
    public getRoundItemY(row: number, col: number): number | null {
        const position = this.getRoundItemPosition(row, col);
        return position ? position.y : null;
    }

    /**
     * 获取所有圆点坐标的Map
     * @returns Map对象，key为 "row_col"，value为 {x, y}
     */
    public getAllRoundItemPositions(): Map<string, { x: number, y: number }> {
        return this.roundItemPositions;
    }

    /**
     * 检查指定位置是否存在圆点
     * @param row 行索引
     * @param col 列索引
     * @returns 是否存在
     */
    public hasRoundItem(row: number, col: number): boolean {
        const key = `${row}_${col}`;
        return this.roundItemPositions.has(key);
    }

    /**
     * 检查指定坐标是否存在圆点（通过坐标查找）
     * @param x X坐标
     * @param y Y坐标
     * @returns 是否存在圆点
     */
    public hasRoundItemByPosition(x: number, y: number): boolean {
        const tolerance = 0.1;
        for (const pos of this.roundItemPositions.values()) {
            if (Math.abs(pos.x - x) < tolerance && Math.abs(pos.y - y) < tolerance) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查路径在指定方向上是否被其他路径阻挡
     * 沿着箭头方向递归检查，直到遇到非地图圆圈的位置
     * @param pathIdx 当前路径索引
     * @param direction 箭头方向 {x, y}
     * @returns true表示被阻挡，false表示可以移动
     */
    public isPathBlocked(pathIdx: number, direction: { x: number, y: number }): boolean {
        if (pathIdx < 0 || pathIdx >= this.arrowPaths.length) {
            return true;
        }

        const path = this.arrowPaths[pathIdx];
        if (!path || path.length < 2) {
            return true;
        }

        if (direction.x === 0 && direction.y === 0) {
            return false;
        }

        const headX = path[0].x;
        const headY = path[0].y;

        const horizontalGap = Macro.mapRoundHorizontalGap;
        const verticalGap = Macro.maoRoundVerticalGap;

        // 沿着箭头方向递归检查，直到遇到非地图圆圈的位置
        let checkX = headX;
        let checkY = headY;
        let step = 0;
        const maxSteps = 50; // 防止无限循环，增加步数以覆盖更大的地图

        while (step < maxSteps) {
            if (direction.x !== 0) {
                checkX = headX + direction.x * horizontalGap * (step + 1);
                checkY = headY;
            } else if (direction.y !== 0) {
                checkX = headX;
                checkY = headY + direction.y * verticalGap * (step + 1);
            } else {
                break;
            }

            const isMapCircle = this.hasRoundItemByPosition(checkX, checkY);
            if (!isMapCircle) {
                // 如果已经不是地图圆圈，说明已经检查完整个方向，没有阻挡
                console.log(`路径 ${pathIdx} 在方向 (${direction.x}, ${direction.y}) 上检查到第 ${step + 1} 步，已超出地图范围，无阻挡`);
                return false;
            }

            // 如果还是地图圆圈，检查这个位置是否有其他路径（除了当前路径）
            const BlockedPathIdx = this.checkPathHit(checkX, checkY, 5)
            if (BlockedPathIdx >= 0 && BlockedPathIdx !== pathIdx && !this.pathLeftMap[BlockedPathIdx]) {
                console.log(`被路径 ${BlockedPathIdx} 阻挡`);
                return true;
            }
            step++;
        }

        // 如果检查了maxSteps次还是地图圆圈，说明可能有问题，返回false允许移动
        console.warn(`路径 ${pathIdx} 方向检查达到最大步数 ${maxSteps}，允许移动`);
        return false;
    }

    /**
     * 获取箭头路径数组
     */
    public getArrowPaths(): { x: number, y: number }[][] {
        return this.arrowPaths;
    }

    /**
     * 设置箭头路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this.arrowPaths = paths.map(path => [...path]);
        // 初始化 pathLeftMap，确保长度匹配
        this.pathLeftMap = new Array(paths.length).fill(false);
    }

    /**
     * 添加一条箭头路径
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        if (points.length >= 2) {
            this.arrowPaths.push([...points]);
            this.pathLeftMap.push(false); // 新路径初始化为未离开
        }
    }

    /**
     * 获取路径离开地图状态数组
     */
    public getPathLeftMap(): boolean[] {
        return this.pathLeftMap;
    }

    /**
     * 检查指定路径是否已离开地图
     * @param pathIdx 路径索引
     */
    public isPathLeftMap(pathIdx: number): boolean {
        return this.pathLeftMap[pathIdx] === true;
    }

    /**
     * 检查是否所有路径都已离开地图（通关条件）
     */
    public areAllPathsLeftMap(): boolean {
        if (this.pathLeftMap.length === 0) {
            return false;
        }
        return this.pathLeftMap.every(left => left === true);
    }

    /**
     * 清空箭头路径
     */
    public clearArrowPaths(): void {
        this.arrowPaths = [];
    }

    /**
     * 切换到下一关
     */
    public async nextLevel(): Promise<void> {
        return this.loadLevel(this.currentLevel + 1);
    }

    /**
     * 切换到指定关卡
     */
    public async switchLevel(level: number): Promise<void> {
        return this.loadLevel(level);
    }
}

