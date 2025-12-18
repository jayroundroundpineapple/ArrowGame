import { JsonAsset, Prefab, resources, instantiate, Vec3, Node } from 'cc';
import { Macro } from './Macro';
import { mapRoundItem } from './mapRoundItem';

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

    // 箭头路径相关
    private arrowPaths: { x: number, y: number }[][] = []; // 箭头路径数组

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
     * @param x2 终点X坐标
     * @param y2 终点Y坐标
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
                if (levelInfo.rowCounts && Array.isArray(levelInfo.rowCounts)) {
                    this.createMapRoundItemsWithRowCounts(levelInfo.rows, levelInfo.rowCounts);
                } else {
                    this.createMapRoundItems(levelInfo.rows, levelInfo.cols);
                }

                resolve();
            });
        });
    }

    /**
     * 根据行数和列数创建 mapRoundItem（规则布局）
     * @param rows 行数
     * @param cols 列数
     */
    private createMapRoundItems(rows: number, cols: number): void {
        if (!this.gameMapNode || !this.mapRoundItemPre) {
            console.error('gameMapNode 或 mapRoundItemPre 未设置');
            return;
        }

        const totalRows = this.levelData.rows;
        const totalCols = this.levelData.cols;

        // 遍历创建每个圆点
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // 实例化预制体
                const itemNode = instantiate(this.mapRoundItemPre);
                
                // 设置位置
                const x = (col - Math.floor(totalCols / 2)) * Macro.mapRoundHorizontalGap;
                const y = (row * Macro.maoRoundVerticalGap);
                itemNode.setPosition(new Vec3(x, y, 0));

                // 设置父节点
                itemNode.setParent(this.gameMapNode);

                // 获取 mapRoundItem 组件并初始化
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    mapRoundItemComp.initItem(row, col, x, y);
                    this.roundItemsArr.push(mapRoundItemComp);
                }
            }
        }

        console.log(`成功创建 ${rows} 行 ${cols} 列的 mapRoundItem，共 ${rows * cols} 个`);
    }

    /**
     * 根据行数和每行的圆点数量创建 mapRoundItem（非规则布局，如菱形）
     * @param rows 总行数
     * @param rowCounts 每行的圆点数量数组
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

        let totalItems = 0;

        // 遍历每一行
        for (let row = 0; row < rows; row++) {
            const countInRow = rowCounts[row];
            if (countInRow <= 0) continue;

            // 计算当前行的起始X位置（居中）
            const offsetX = -(countInRow - 1) * Macro.mapRoundHorizontalGap / 2;

            // 在当前行创建圆点
            for (let col = 0; col < countInRow; col++) {
                // 实例化预制体
                const itemNode = instantiate(this.mapRoundItemPre);

                // 设置位置（每行居中）
                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                const y = row * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));

                // 设置父节点
                itemNode.setParent(this.gameMapNode);

                // 获取 mapRoundItem 组件并初始化
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    mapRoundItemComp.initItem(row, col, x, y);
                    this.roundItemsArr.push(mapRoundItemComp);
                }
                totalItems++;
            }
        }

        console.log(`成功创建 ${rows} 行非规则布局的 mapRoundItem，共 ${totalItems} 个`);
        console.log(`每行圆点数量: [${rowCounts.join(', ')}]`);
    }

    /**
     * 初始化箭头路径
     */
    public initArrows(): void {
        // 清空之前的路径
        this.arrowPaths = [];

        // 示例：设置多条箭头路径，每条路径方向不同，弯弯曲曲的长路径
        // 路径1：向上箭头 - 先向右，再向上，再向左，再向上
        this.arrowPaths.push([
            { x: 0, y: 100 },
            { x: 50, y: 100 },
            { x: 50, y: 150 },
            { x: 0, y: 150 },
            { x: 0, y: 200 }
        ]);

        // 路径2：向下箭头 - 先向左，再向下，再向右，再向下
        this.arrowPaths.push([
            { x: 150, y: 200 },
            { x: 100, y: 200 },
            { x: 100, y: 150 },
            { x: 150, y: 150 },
            { x: 150, y: 100 }
        ]);

        // 路径3：向右箭头 - 先向上，再向右，再向下，再向右
        this.arrowPaths.push([
            { x: 0, y: 0 },
            { x: 0, y: 50 },
            { x: 50, y: 50 },
            { x: 50, y: 0 },
            { x: 100, y: 0 }
        ]);

        // 路径4：向左箭头 - 先向下，再向左，再向上，再向左
        this.arrowPaths.push([
            { x: 250, y: 0 },
            { x: 250, y: -50 },
            { x: 200, y: -50 },
            { x: 200, y: 0 },
            { x: 150, y: 0 }
        ]);

        // 路径5：向上箭头 - 先向右，再向上，再向左，再向上，再向右
        this.arrowPaths.push([
            { x: 200, y: -100 },
            { x: 250, y: -100 },
            { x: 250, y: -50 },
            { x: 200, y: -50 },
            { x: 200, y: 0 },
            { x: 250, y: 0 }
        ]);

        // 路径6：向下箭头 - 先向左，再向下，再向右，再向下，再向左
        this.arrowPaths.push([
            { x: 350, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 50 },
            { x: 350, y: 50 },
            { x: 350, y: 0 },
            { x: 300, y: 0 }
        ]);

        console.log('箭头路径初始化完成');
    }

    // ========== Getter/Setter ==========

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
    }

    /**
     * 添加一条箭头路径
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        if (points.length >= 2) {
            this.arrowPaths.push([...points]);
        }
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

