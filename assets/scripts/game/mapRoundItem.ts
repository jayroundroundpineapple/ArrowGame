import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('mapRoundItem')
export class mapRoundItem extends Component {
    @property(Node)
    private mapNode: Node = null;

    _round: number = 0; //地图当前圆点所在行
    _colMun:number = 0; //地图当前圆点所在列
    initItem(roundIndex: number, colMunIndex: number){
        this._round = roundIndex;
        this._colMun = colMunIndex;
    }
    set RoundIndex(roundIndex: number){
        this._round = roundIndex;
    }
    set ColMunIndex(colMunIndex: number){
        this._colMun = colMunIndex;
    }
    get RoundIndex(): number {
        return this._round;
    }
    get ColMunIndex(): number {
        return this._colMun;
    }
}

